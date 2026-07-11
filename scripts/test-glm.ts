import { chatCompletion } from '../src/lib/llm';

async function main() {
  console.log('=== GLM 5.2 Connection Tests ===\n');

  // Test 1: Simple chat
  console.log('[1] Simple chat (max_tokens=5)...');
  const t1 = Date.now();
  try {
    const r1 = await chatCompletion('You are a test bot.', 'Say OK', { maxTokens: 5 });
    console.log(`    -> OK (${Date.now() - t1}ms): "${r1.trim()}"`);
  } catch (e: any) {
    console.log(`    -> FAIL (${Date.now() - t1}ms): ${e.status || ''} ${e.message?.substring(0, 80)}`);
  }

  // Test 2: JSON structured output
  console.log('[2] Structured JSON output...');
  const t2 = Date.now();
  try {
    const { getJSONResponse } = await import('../src/lib/llm');
    const r2 = await getJSONResponse<{ result: string }>(
      'Return a JSON object with a single field "result" set to "pass".',
      'Return only JSON.'
    );
    console.log(`    -> OK (${Date.now() - t2}ms): result=${r2.result}`);
  } catch (e: any) {
    console.log(`    -> FAIL (${Date.now() - t2}ms): ${e.status || ''} ${e.message?.substring(0, 100)}`);
  }

  // Test 3: Medium-length response (~2K tokens)
  console.log('[3] Medium-length response (~1K tokens)...');
  const t3 = Date.now();
  try {
    const r3 = await chatCompletion('You are a test bot.',
      'Write a paragraph about DeFi security (about 150 words).',
      { maxTokens: 500 }
    );
    console.log(`    -> OK (${Date.now() - t3}ms): ${r3.length} chars`);
  } catch (e: any) {
    console.log(`    -> FAIL (${Date.now() - t3}ms): ${e.status || ''} ${e.message?.substring(0, 80)}`);
  }

  // Test 4: Large prompt (simulating full source code input)
  console.log('[4] Large input (~4K tokens, 500 output)...');
  const t4 = Date.now();
  try {
    const largeInput = 'contract Test { ' + 'uint256 public x; function foo() external { x = 1; } '.repeat(100) + '}';
    const r4 = await chatCompletion('You are a Solidity auditor. Analyze the contract.',
      `Analyze this contract for vulnerabilities:\n\`\`\`solidity\n${largeInput}\n\`\`\``,
      { maxTokens: 500 }
    );
    console.log(`    -> OK (${Date.now() - t4}ms): ${r4.length} chars`);
  } catch (e: any) {
    console.log(`    -> FAIL (${Date.now() - t4}ms): ${e.status || ''} ${e.message?.substring(0, 80)}`);
  }

  // Test 5: Very long output (~16K tokens)
  console.log('[5] Large output (max_tokens=16384)...');
  const t5 = Date.now();
  try {
    const r5 = await chatCompletion('You are a test bot.',
      'List 100 famous programming languages, each with a one-line description.',
      { maxTokens: 16384 }
    );
    console.log(`    -> OK (${Date.now() - t5}ms): ${r5.length} chars (${Math.round(r5.length / 4)} est tokens)`);
  } catch (e: any) {
    console.log(`    -> FAIL (${Date.now() - t5}ms): ${e.status || ''} ${e.message?.substring(0, 80)}`);
  }

  console.log('\n=== All tests complete ===');
}

main().catch(console.error);
