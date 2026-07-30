import { parse, visit } from '@solidity-parser/parser';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import type { BlockchainId } from '@/lib/blockchain/config';
import type { CrossContractGraph, CrossContractEdge, CrossContractNode, CrossContractSummary } from './types';
import { KNOWN_PROTOCOLS } from './known-protocols';

const MAX_DEPTH = 2;
const MAX_NODES = 10;
const MAX_SOURCE_LINES_PER_NODE = 50;

type SolidityAST = ReturnType<typeof parse>;

const KNOWN_INTERFACES = [
  'IERC20', 'IERC721', 'IUniswapV2Pair', 'IUniswapV3Pool',
  'IOracle', 'IPool', 'IAaveV3Pool', 'ICurvePool', 'IBalancerVault',
  'AggregatorV3Interface',
];

/** Interfaces whose runtime-variable calls trigger warning edges for OD-01/CR-01/CR-04 */
const PRICE_SENSITIVE_INTERFACES = [
  'IERC20', 'IUniswapV2Pair', 'IUniswapV3Pool', 'IOracle', 'IPool',
  'IAaveV3Pool', 'ICurvePool', 'IBalancerVault',
  'AggregatorV3Interface', 'IPriceFeed', 'ISwapRouter',
];

/** Sentinel address for runtime-variable interface calls (not a real contract) */
const RUNTIME_VAR_SENTINEL = '0x0000000000000000000000000000000000000001';

export class CrossContractTracer {
  private visited = new Set<string>();
  private nodes: CrossContractNode[] = [];
  private edges: CrossContractEdge[] = [];
  private truncated = false;

  async trace(
    sourceCode: string,
    mainContractName: string,
    blockchain: BlockchainId,
    mainAddress?: string,
  ): Promise<CrossContractSummary> {
    this.nodes = [];
    this.edges = [];
    this.visited.clear();
    this.truncated = false;

    const mainNode: CrossContractNode = {
      address: mainAddress || 'main',
      contractName: mainContractName,
      source: 'main',
      sourceCode: this.truncateSource(sourceCode),
    };
    this.nodes.push(mainNode);
    this.visited.add(mainNode.address.toLowerCase());

    await this.traceContract(sourceCode, mainContractName, mainAddress || 'main', blockchain, 0);

    const graph: CrossContractGraph = {
      nodes: this.nodes,
      edges: this.edges,
      maxDepth: MAX_DEPTH,
      truncated: this.truncated,
    };

    return {
      graph,
      promptContext: this.buildPromptContext(graph),
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length,
    };
  }

  private async traceContract(
    sourceCode: string,
    contractName: string,
    currentAddress: string,
    blockchain: BlockchainId,
    depth: number,
  ): Promise<void> {
    if (depth >= MAX_DEPTH || this.nodes.length >= MAX_NODES) {
      this.truncated = true;
      return;
    }

    let ast: SolidityAST;
    try {
      ast = parse(sourceCode, { loc: true, range: true });
    } catch {
      return;
    }

    const externalCalls = this.extractExternalCalls(ast, currentAddress);

    for (const call of externalCalls) {
      if (this.nodes.length >= MAX_NODES) {
        this.truncated = true;
        break;
      }

      // Runtime-variable interface calls cannot be resolved statically — record edge without fetch
      if (call.callType === 'runtime-interface-call') {
        this.edges.push(call);
        continue;
      }

      const targetAddr = call.to;
      if (!targetAddr || this.visited.has(targetAddr.toLowerCase())) {
        if (targetAddr && !this.visited.has(targetAddr.toLowerCase())) {
          this.edges.push(call);
        }
        continue;
      }

      this.visited.add(targetAddr.toLowerCase());

      const fetchResult = await fetchContractWithCache(targetAddr, blockchain);
      const nodeSource: CrossContractNode['source'] = fetchResult.success
        ? (fetchResult.sourceType === 'decompiled' ? 'external-decompiled' : 'external-verified')
        : 'unknown';
      const node: CrossContractNode = {
        address: targetAddr,
        contractName: fetchResult.success ? (fetchResult.contractName || targetAddr.slice(0, 8)) : targetAddr.slice(0, 8),
        source: nodeSource,
        sourceCode: fetchResult.success ? this.truncateSource(fetchResult.sourceCode || '') : undefined,
        protocolRole: this.matchKnownProtocol(targetAddr),
      };
      this.nodes.push(node);
      this.edges.push(call);

      if (fetchResult.success && fetchResult.sourceCode) {
        await this.traceContract(
          fetchResult.sourceCode,
          node.contractName,
          targetAddr,
          blockchain,
          depth + 1,
        );
      }
    }
  }

  private extractExternalCalls(ast: SolidityAST, fromAddress: string): CrossContractEdge[] {
    const edges: CrossContractEdge[] = [];

    visit(ast, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      FunctionCall: (node: any) => {
        const expr = node.expression;
        if (expr && expr.type === 'MemberAccess') {
          const memberName = expr.memberName;
          if (['call', 'staticcall', 'delegatecall'].includes(memberName)) {
            const targetAddr = this.extractAddressFromExpression(expr.expression);
            if (targetAddr) {
              edges.push({
                from: fromAddress,
                to: targetAddr,
                functionName: memberName,
                callType: memberName as 'call' | 'staticcall' | 'delegatecall',
                sourceLine: node.loc?.start?.line || 0,
              });
            }
          }
        }

        if (expr && expr.type === 'MemberAccess' && expr.expression?.type === 'FunctionCall') {
          const innerExpr = expr.expression.expression;
          if (innerExpr && innerExpr.type === 'Identifier') {
            const typeName = innerExpr.name;
            if (KNOWN_INTERFACES.includes(typeName)) {
              const targetAddr = this.extractAddressFromArgs(expr.expression.arguments);
              if (targetAddr) {
                edges.push({
                  from: fromAddress,
                  to: targetAddr,
                  functionName: expr.memberName,
                  callType: 'interface-call',
                  sourceLine: node.loc?.start?.line || 0,
                });
              } else if (PRICE_SENSITIVE_INTERFACES.includes(typeName)) {
                // Address is a runtime variable (state var / parameter) — emit warning edge
                const varName = this.extractVarNameFromArgs(expr.expression.arguments);
                if (varName) {
                  edges.push({
                    from: fromAddress,
                    to: RUNTIME_VAR_SENTINEL,
                    functionName: `${typeName}.${expr.memberName}()`,
                    callType: 'runtime-interface-call',
                    sourceLine: node.loc?.start?.line || 0,
                    runtimeVar: { variableName: varName, interfaceType: typeName },
                  });
                }
              }
            }
          }
        }
      },
    });

    return edges;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractVarNameFromArgs(args: any[]): string | null {
    if (!args || args.length === 0) return null;
    const firstArg = args[0];
    if (firstArg?.type === 'Identifier') {
      return firstArg.name;
    }
    // Handle IUniswapV2Pair(address(stateVar)) double wrapping
    if (firstArg?.type === 'FunctionCall' && firstArg.expression?.type === 'Identifier' && firstArg.expression?.name === 'address') {
      const innerArg = firstArg.arguments?.[0];
      if (innerArg?.type === 'Identifier') {
        return innerArg.name;
      }
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractAddressFromExpression(expr: any): string | null {
    if (!expr) return null;
    if (expr.type === 'FunctionCall' && expr.expression?.type === 'Identifier') {
      return this.extractAddressFromArgs(expr.arguments);
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractAddressFromArgs(args: any[]): string | null {
    if (!args || args.length === 0) return null;
    const firstArg = args[0];
    if (firstArg?.type === 'HexLiteral' || firstArg?.type === 'StringLiteral') {
      const val = firstArg.value || '';
      if (/^0x[a-fA-F0-9]{40}$/.test(val)) {
        return val;
      }
    }
    if (firstArg?.type === 'NumberLiteral') {
      const num = firstArg.number;
      if (num.length >= 40) {
        return '0x' + num.slice(-40).toLowerCase();
      }
    }
    return null;
  }

  private matchKnownProtocol(address: string): string | undefined {
    const lower = address.toLowerCase();
    for (const [name, addrs] of Object.entries(KNOWN_PROTOCOLS)) {
      if (addrs.some(a => a.toLowerCase() === lower)) {
        return name;
      }
    }
    return undefined;
  }

  private truncateSource(source: string): string {
    const lines = source.split('\n');
    if (lines.length <= MAX_SOURCE_LINES_PER_NODE) return source;
    const head = lines.slice(0, Math.floor(MAX_SOURCE_LINES_PER_NODE * 0.6));
    const tail = lines.slice(-Math.floor(MAX_SOURCE_LINES_PER_NODE * 0.3));
    return `${head.join('\n')}\n\n// ... [truncated ${lines.length - MAX_SOURCE_LINES_PER_NODE} lines] ...\n\n${tail.join('\n')}`;
  }

  private buildPromptContext(graph: CrossContractGraph): string {
    const runtimeEdges = graph.edges.filter(e => e.callType === 'runtime-interface-call');
    const resolvedEdges = graph.edges.filter(e => e.callType !== 'runtime-interface-call');

    // No known external dependencies at all
    if (graph.nodes.length <= 1 && runtimeEdges.length === 0) {
      return 'No external contract dependencies detected.';
    }

    const sections: string[] = [];

    // Runtime-variable warning (even without resolved external calls)
    if (runtimeEdges.length > 0) {
      sections.push('## ⚠ External Interface Calls (Runtime Variables)');
      sections.push('These calls use addresses stored in state variables or parameters — cannot be statically resolved:');
      runtimeEdges.forEach(edge => {
        const varInfo = edge.runtimeVar
          ? `(\`${edge.runtimeVar.variableName}\`: ${edge.runtimeVar.interfaceType})`
          : '';
        sections.push(`- \`${edge.functionName}\` at line ${edge.sourceLine} ${varInfo}`);
      });
      sections.push('');
      sections.push('These dynamic addresses could point to price-sensitive contracts. Recommend manual verification.');
      sections.push('Please pay special attention to **OD-01** (spot price), **CR-01** (external price source), and **CR-04** (cross-protocol price dependency).');
      sections.push('');
    }

    if (graph.nodes.length > 1) {
      sections.push('## Cross-Contract Dependency Graph');
      sections.push(`Detected ${graph.nodes.length} contracts and ${resolvedEdges.length} external calls (max depth: ${graph.maxDepth}).${graph.truncated ? ' [TRUNCATED]' : ''}`);
      sections.push('');

      sections.push('### Contracts:');
      graph.nodes.forEach((node, i) => {
        const role = node.protocolRole ? ` [${node.protocolRole}]` : '';
        const src = node.source === 'main' ? '(main contract)' : node.source === 'unknown' ? '(source unavailable)' : '(verified)';
        sections.push(`[${i}] ${node.contractName} at ${node.address} ${src}${role}`);
      });

      if (resolvedEdges.length > 0) {
        sections.push('');
        sections.push('### External Calls:');
        resolvedEdges.forEach(edge => {
          const fromNode = graph.nodes.find(n => n.address.toLowerCase() === edge.from.toLowerCase());
          const toNode = graph.nodes.find(n => n.address.toLowerCase() === edge.to.toLowerCase());
          const fromName = fromNode?.contractName || edge.from;
          const toName = toNode?.contractName || edge.to;
          sections.push(`- ${fromName} → ${toName}.${edge.functionName}() [${edge.callType}] (line ${edge.sourceLine})`);
        });
      }

      const externalNodes = graph.nodes.filter(n => n.source !== 'main' && n.sourceCode);
      if (externalNodes.length > 0) {
        sections.push('');
        sections.push('### External Contract Source Fragments:');
        externalNodes.forEach((node) => {
          const idx = graph.nodes.indexOf(node);
          sections.push(`[${idx}] ${node.contractName} (${node.address}):`);
          sections.push('```solidity');
          sections.push(node.sourceCode || '// Source unavailable');
          sections.push('```');
        });
      }
    }

    if (!sections.some(s => s.includes('Please pay special attention'))) {
      sections.push('');
      sections.push('Please pay special attention to CR-01 through CR-04 cross-protocol price dependency vulnerabilities.');
    }

    return sections.join('\n');
  }
}
