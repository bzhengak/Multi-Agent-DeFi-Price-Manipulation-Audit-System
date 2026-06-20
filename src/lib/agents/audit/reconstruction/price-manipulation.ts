import type {
  PriceManipulationAttack, AttackStep, FundFlow, DefenseRecommendation,
  DifficultyLevel, PatternOverlay, TemplateInput,
} from './types';
import type { ProtocolClassification } from '../protocols/types';

function getCategoryPrefix(patternId: string): string {
  return patternId.substring(0, 2);
}

// ─── Category Base Templates (DeFi auditor-graded) ──────────────────
// Each defines a 6-phase skeleton; pattern overlays + per-finding LLM
// details are injected at merge time for per-vulnerability specificity.

type CategoryTemplate = {
  name: string;
  steps: () => AttackStep[];
  fundFlow: () => FundFlow[];
  defenses: DefenseRecommendation;
  difficulty: DifficultyLevel;
};

const CATEGORY_TEMPLATES: Record<string, CategoryTemplate> = {
  OD: {
    name: 'Oracle Dependency Exploit',
    steps: () => [
      { phase: 'preparation', actor: 'attacker', action: 'Obtain capital via flash loan to execute the oracle manipulation', target: 'Flash loan provider / lending protocol', expectedOutcome: 'Large capital pool available for price distortion' },
      { phase: 'execution', actor: 'attacker', action: 'Perform the oracle manipulation action', target: 'Price oracle / data feed', expectedOutcome: 'Oracle price feed deviates from true market value' },
      { phase: 'manipulation', actor: 'protocol', action: 'Protocols price-dependent function reads the manipulated oracle value', target: 'Price-consuming function (swap, borrow, mint, liquidate)', expectedOutcome: 'Protocol operates on false price data' },
      { phase: 'exploitation', actor: 'attacker', action: 'Exploit the price discrepancy to extract protocol value', target: 'Vulnerable protocol function', expectedOutcome: 'Excess value extracted via manipulated price' },
      { phase: 'profit', actor: 'attacker', action: 'Convert exploited tokens to base asset (ETH / USDC / USDT)', target: 'DEX or CEX', expectedOutcome: 'Attack profit materialized in liquid asset' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan with interest, retaining surplus as net profit', target: 'Flash loan provider', expectedOutcome: 'Flash loan liability extinguished, net profit secured' },
    ],
    fundFlow: () => [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'base asset', amount: 'flash loan principal', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'DEX / Oracle Pool', role: 'intermediate' }, asset: 'manipulation tokens', amount: 'large volume', step: 2 },
      { from: { entity: 'Vulnerable Protocol', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'extracted value', amount: 'price delta × position size', step: 3 },
    ],
    defenses: {
      immediate: ['Use TWAP / cumulative price instead of spot price', 'Add Chainlink or multi-source oracle as secondary feed', 'Implement price deviation circuit breaker (block if > 10% deviation)'],
      shortTerm: ['Integrate multiple independent oracle sources with median/trimmed-mean aggregation', 'Add staleness checks: block.timestamp - updatedAt < 1 hour'],
      longTerm: ['Adopt decentralized oracle network (Chainlink, Tellor)', 'Deploy off-chain oracle guardian with automated circuit breaker'],
    },
    difficulty: 'medium',
  },
  LR: {
    name: 'Liquidity & Reserve Manipulation',
    steps: () => [
      { phase: 'preparation', actor: 'attacker', action: 'Obtain flash loan to accumulate tokens for reserve manipulation', target: 'Flash loan provider', expectedOutcome: 'Large token position ready for pool interaction' },
      { phase: 'execution', actor: 'attacker', action: 'Execute operation to distort pool reserve ratio or protocol state', target: 'AMM pool / lending market', expectedOutcome: 'Reserve ratio or supply state deviates from equilibrium' },
      { phase: 'manipulation', actor: 'protocol', action: 'Contract reads distorted reserves or supply for share/pricing calculation', target: 'Reserve-dependent function (mint, burn, liquidate, reward)', expectedOutcome: 'Calculation based on manipulated state data' },
      { phase: 'exploitation', actor: 'attacker', action: 'Execute protocol operation at terms favorable from the distorted state', target: 'Vulnerable contract', expectedOutcome: 'Disproportionate gain from manipulated ratio' },
      { phase: 'profit', actor: 'attacker', action: 'Convert extracted tokens to base asset via swap', target: 'DEX', expectedOutcome: 'Attack profit realized in liquid asset' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan, retain surplus', target: 'Flash loan provider', expectedOutcome: 'Net profit secured after loan repayment' },
    ],
    fundFlow: () => [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'tokens', amount: 'flash loan amount', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'Pool / Protocol', role: 'intermediate' }, asset: 'manipulation input', amount: 'skewed ratio or inflated position', step: 2 },
      { from: { entity: 'Protocol / Pool', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'profit tokens', amount: 'extracted delta', step: 3 },
    ],
    defenses: {
      immediate: ['Add reserve validation before share calculation', 'Implement minimum liquidity and time-weighted averaging', 'Add operation-level slippage protection'],
      shortTerm: ['Use oracle for reserve data verification', 'Enforce delay on large position changes'],
      longTerm: ['Restructure reserve-independent pricing logic', 'Implement cumulative reserve oracle'],
    },
    difficulty: 'medium',
  },
  TO: {
    name: 'Transaction Ordering & MEV Exploit',
    steps: () => [
      { phase: 'preparation', actor: 'mev_bot', action: 'Scan mempool for pending swap / deposit / liquidate transactions', target: 'Mempool / block builder', expectedOutcome: 'Victim transaction identified and queued for ordering attack' },
      { phase: 'execution', actor: 'mev_bot', action: 'Insert front-run transaction before victim, manipulating on-chain state', target: 'DEX pool or protocol state', expectedOutcome: 'Price or state skewed in attackers favor before victim tx executes' },
      { phase: 'manipulation', actor: 'victim', action: 'Victim transaction executes at manipulated price or stale state', target: 'Protocol / DEX', expectedOutcome: 'Victim receives worse execution than fair market value' },
      { phase: 'exploitation', actor: 'mev_bot', action: 'Back-run transaction to restore state and capture the spread', target: 'DEX pool', expectedOutcome: 'MEV profit extracted from price reversion spread' },
      { phase: 'profit', actor: 'mev_bot', action: 'Net profit from sandwich spread or ordering advantage', target: 'MEV bots address', expectedOutcome: 'Risk-free profit captured within single block' },
      { phase: 'cleanup', actor: 'mev_bot', action: 'Attack completes atomically in single block; no further cleanup', target: 'None', expectedOutcome: 'Attack complete, positions closed within block boundaries' },
    ],
    fundFlow: () => [
      { from: { entity: 'MEV Bot', role: 'source' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'token A', amount: 'front-run buy size', step: 1 },
      { from: { entity: 'Victim', role: 'source' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'token A', amount: 'victim swap size', step: 2 },
      { from: { entity: 'DEX Pool', role: 'intermediate' }, to: { entity: 'MEV Bot', role: 'destination' }, asset: 'token B', amount: 'back-run sell proceeds', step: 3 },
    ],
    defenses: {
      immediate: ['Add deadline parameter to all state-mutating functions (5-10 minute window)', 'Enforce minimum output amount (slippage protection)'],
      shortTerm: ['Integrate MEV protection (Flashbots Protect, MEV Blocker)', 'Use private transaction mempools'],
      longTerm: ['Deploy fair-ordering consensus (Themis, F3B)', 'Implement commit-reveal for sensitive operations'],
    },
    difficulty: 'low',
  },
  AC: {
    name: 'Access Control & Privilege Exploit',
    steps: () => [
      { phase: 'preparation', actor: 'insider', action: 'Identify privileged function lacking timelock or multi-sig protection', target: 'Protocol admin / governance contract', expectedOutcome: 'Unilateral admin capability confirmed' },
      { phase: 'execution', actor: 'insider', action: 'Execute privileged function to alter critical protocol parameter', target: 'Protocol configuration (oracle address, fee rate, LTV)', expectedOutcome: 'Protocol parameter maliciously modified' },
      { phase: 'manipulation', actor: 'protocol', action: 'Protocol operates with altered parameters affecting all users', target: 'Protocol core logic', expectedOutcome: 'Economic invariant broken; protocol state manipulated' },
      { phase: 'exploitation', actor: 'insider', action: 'Extract value through manipulated parameters', target: 'Protocol treasury / user deposits', expectedOutcome: 'Funds or value extracted from protocol' },
      { phase: 'profit', actor: 'insider', action: 'Convert stolen assets through DEX or CEX to exit currency', target: 'DEX / CEX', expectedOutcome: 'Pilfered value converted to liquid exit asset' },
      { phase: 'cleanup', actor: 'insider', action: 'Exit protocol; transaction trail visible on-chain', target: 'None', expectedOutcome: 'Attacker exits with irreversible on-chain record' },
    ],
    fundFlow: () => [
      { from: { entity: 'Privileged Account', role: 'source' }, to: { entity: 'Protocol Admin', role: 'intermediate' }, asset: 'admin privilege', amount: 'unilateral access', step: 1 },
      { from: { entity: 'Protocol / Users', role: 'intermediate' }, to: { entity: 'Insider', role: 'destination' }, asset: 'stolen tokens', amount: 'extracted value', step: 2 },
    ],
    defenses: {
      immediate: ['Add minimum 24-hour timelock to all admin parameter setters', 'Require multi-signature (3/5 minimum) for critical changes'],
      shortTerm: ['Implement governance voting with quorum for parameter changes', 'Emit events on all admin actions with off-chain monitoring'],
      longTerm: ['Migrate to full DAO governance with token-weighted voting', 'Deploy timelock with 48+ hour delay and veto mechanism'],
    },
    difficulty: 'low',
  },
  CL: {
    name: 'Calculation Logic Exploit',
    steps: () => [
      { phase: 'preparation', actor: 'attacker', action: 'Analyze contract math: identify rounding direction, decimal precision gaps, or invariant edge cases', target: 'Math-critical functions', expectedOutcome: 'Exploitable arithmetic flaw located' },
      { phase: 'execution', actor: 'attacker', action: 'Craft input parameters to trigger the calculation vulnerability', target: 'Vulnerable calculation function', expectedOutcome: 'Arithmetic produces incorrect output favoring attacker' },
      { phase: 'manipulation', actor: 'protocol', action: 'Protocol uses flawed calculation result for state update', target: 'Downstream logic (share calculation, swap pricing, fee assessment)', expectedOutcome: 'Protocol state updated with incorrect values' },
      { phase: 'exploitation', actor: 'attacker', action: 'Repeat micro-exploit to compound gains from calculation bias', target: 'Vulnerable contract', expectedOutcome: 'Accumulated profit from systematic arithmetic exploitation' },
      { phase: 'profit', actor: 'attacker', action: 'Withdraw accumulated excess tokens', target: 'Contract withdrawal function', expectedOutcome: 'Profitable value extracted' },
      { phase: 'cleanup', actor: 'attacker', action: 'Often self-funded; no flash loan cleanup needed', target: 'None', expectedOutcome: 'Attack completes without external loan dependency' },
    ],
    fundFlow: () => [
      { from: { entity: 'Attacker', role: 'source' }, to: { entity: 'Vulnerable Contract', role: 'intermediate' }, asset: 'input tokens', amount: 'crafted precision amount', step: 1 },
      { from: { entity: 'Vulnerable Contract', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'excess tokens', amount: 'rounding / decimal delta', step: 2 },
    ],
    defenses: {
      immediate: ['Multiply before dividing (avoid premature precision loss)', 'Normalize all token amounts to 18 decimals before arithmetic', 'Use PRBMath or Solady fixed-point libraries'],
      shortTerm: ['Add minimum operation amount to prevent dust-amount attacks', 'Implement fuzz testing for extreme input ranges'],
      longTerm: ['Formally verify critical calculation logic with Certora / SMTChecker'],
    },
    difficulty: 'high',
  },
  CR: {
    name: 'Composability & Cross-Protocol Exploit',
    steps: () => [
      { phase: 'preparation', actor: 'attacker', action: 'Map external protocol dependency graph in contracts price or state logic', target: 'External protocol integration points', expectedOutcome: 'Single or multi-hop dependency identified' },
      { phase: 'execution', actor: 'attacker', action: 'Manipulate external protocol state or price feed', target: 'External DEX / bridge / lending market', expectedOutcome: 'External price or state distorted' },
      { phase: 'manipulation', actor: 'protocol', action: 'Vulnerable contract reads distorted external data without verification', target: 'Cross-protocol dependent function', expectedOutcome: 'Manipulated external state accepted as valid input' },
      { phase: 'exploitation', actor: 'attacker', action: 'Execute cross-protocol operation at favorable manipulated terms', target: 'Vulnerable contract', expectedOutcome: 'Value extracted across protocol boundaries' },
      { phase: 'profit', actor: 'attacker', action: 'Realize profit across protocol boundaries; convert to base asset', target: 'DEX / lending market', expectedOutcome: 'Cross-protocol arbitrage profit realized' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan if used; unwind multi-protocol positions', target: 'Flash loan provider / external protocols', expectedOutcome: 'All positions closed, net profit retained' },
    ],
    fundFlow: () => [
      { from: { entity: 'Attacker', role: 'source' }, to: { entity: 'External Protocol A', role: 'intermediate' }, asset: 'manipulation capital', amount: 'flash loan or owned capital', step: 1 },
      { from: { entity: 'Vulnerable Protocol B', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'extracted value', amount: 'cross-protocol delta', step: 2 },
    ],
    defenses: {
      immediate: ['Add circuit breaker for external dependency when deviation detected', 'Implement fallback price source or operation halt on anomaly'],
      shortTerm: ['Multi-source external price/state verification', 'Add consistency checks on all external return values'],
      longTerm: ['Reduce external protocol dependency surface', 'Adopt internal oracle aggregation with external cross-validation'],
    },
    difficulty: 'medium',
  },
};

// ─── Per-Pattern Overlays (21 patterns) ─────────────────────────────
// Each overlay provides pattern-specific overrides merged onto its
// category base template. Missing fields inherit from the category.

const PATTERN_OVERLAYS: Record<string, PatternOverlay> = {
  'OD-01': {
    name: 'Spot Price Oracle Manipulation',
    category: 'OD',
    difficulty: 'medium',
    stepOverrides: {
      execution: { action: 'Flash swap large volume through AMM pair to skew getReserves() spot price', target: 'AMM pair contract' },
      manipulation: { target: 'getReserves()-based pricing function' },
      exploitation: { action: 'Mint, burn, or borrow at manipulated spot price for excess value relative to fair market' },
    },
    defenseOverrides: {
      immediate: ['Replace spot price with TWAP (minimum 30-minute window)', 'Add Chainlink price feed as secondary oracle source', 'Implement price deviation circuit breaker (block if > 10% deviation from secondary source)'],
    },
    fundFlowOverrides: [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'token pair', amount: 'flash loan principal', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'AMM Pool', role: 'intermediate' }, asset: 'token A', amount: 'large swap volume', step: 2 },
      { from: { entity: 'Vulnerable Protocol', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'excess tokens', amount: 'manipulated price delta', step: 3 },
    ],
  },
  'OD-02': {
    name: 'Short-Window TWAP Manipulation',
    category: 'OD',
    difficulty: 'medium',
    stepOverrides: {
      preparation: { action: 'Accumulate capital to execute trades over consecutive blocks within the TWAP window', target: 'Flash loan / own capital' },
      execution: { action: 'Execute trades across consecutive blocks to distort short-duration TWAP (e.g., < 30 min window)', target: 'AMM pair with short TWAP oracle' },
      manipulation: { target: 'consult() / observe() TWAP function with insufficient window length' },
      exploitation: { action: 'Protocol uses manipulated TWAP for pricing; attacker extracts value before TWAP corrects' },
    },
    defenseOverrides: {
      immediate: ['Extend TWAP window to minimum 30 minutes (1800 seconds)', 'Use Uniswap V2 cumulative price oracle for long-term resistance', 'Add TWAP deviation check against spot price or Chainlink'],
    },
  },
  'OD-03': {
    name: 'Centralized Oracle Feed Compromise',
    category: 'OD',
    difficulty: 'low',
    stepOverrides: {
      preparation: { action: 'Compromise admin private key or gain unauthorized access to oracle updater role', target: 'Oracle admin infrastructure' },
      execution: { action: 'Submit maliciously crafted price update directly to on-chain oracle contract', target: 'Centralized oracle contract (setPrice / updatePrice)' },
      manipulation: { target: 'Protocol function consuming the single-source centralized price feed' },
      exploitation: { action: 'Execute protocol operations at attacker-set price: borrow, swap, or liquidate at extreme favorable rates' },
      cleanup: { action: 'No flash loan needed; profit extracted through malicious price alone', target: 'None' },
    },
    defenseOverrides: {
      immediate: ['Add multi-signature requirement for all oracle price updates (minimum 3/5)', 'Implement 24-hour timelock on oracle price changes', 'Add maximum deviation cap between successive price updates (e.g., 5% max change)'],
      shortTerm: ['Integrate decentralized oracle (Chainlink) as cross-validation', 'Add anomaly detection alerts on price update frequency'],
    },
  },
  'OD-04': {
    name: 'Stale Oracle Data Exploitation',
    category: 'OD',
    difficulty: 'medium',
    stepOverrides: {
      preparation: { action: 'Monitor oracle contract for periods of inactivity—oracle stops publishing price updates', target: 'Oracle on-chain activity monitor' },
      execution: { action: 'Initiate protocol operation using last known (now stale) price from inactive oracle', target: 'Stale oracle feed via latestRoundData() / latestAnswer()' },
      manipulation: { target: 'Price-consuming function lacking updatedAt or roundId freshness validation' },
      exploitation: { action: 'Borrow, swap, or liquidate at outdated price that no longer reflects true market value' },
      profit: { action: 'Protocol price has drifted from market; attacker captures mispricing delta', target: 'DEX arbitrage / protocol exploit' },
    },
    defenseOverrides: {
      immediate: ['Require block.timestamp - updatedAt < 1 hour (MAX_DELAY) for all oracle reads', 'Validate answeredInRound != 0 and roundId > 0 for Chainlink V3 feeds', 'Implement fallback price source circuit when primary oracle stale'],
    },
  },
  'OD-05': {
    name: 'Oracle Heartbeat / Delay Tolerance Failure',
    category: 'OD',
    difficulty: 'medium',
    stepOverrides: {
      preparation: { action: 'Wait for Chainlink oracle to stop publishing updates — heartbeat timeout breached', target: 'Chainlink oracle node / keeper network' },
      execution: { action: 'Protocol continues using last published price without delay tolerance enforcement', target: 'Oracle feed without block.timestamp - updatedAt > HEARTBEAT check' },
      manipulation: { target: 'latestRoundData() consumed without heartbeat timeout validation' },
      exploitation: { action: 'Execute position at outdated oracle price; protocol has no mechanism to reject' },
    },
    defenseOverrides: {
      immediate: ['Add block.timestamp - updatedAt > maxDelay check (max 1 hour)', 'Implement circuit breaker: pause protocol when oracle heartbeat missed', 'Deploy off-chain monitoring bot to detect Chainlink downtime'],
      shortTerm: ['Cross-validate with secondary oracle (e.g., Tellor) when Chainlink stale', 'Add heartbeat monitoring with automated pause on timeout'],
    },
  },
  'LR-01': {
    name: 'Instant Reserve-Based Mint/Burn Exploit',
    category: 'LR',
    difficulty: 'medium',
    stepOverrides: {
      execution: { action: 'Flash swap large amount to skew AMM pool reserve ratio (reserve0, reserve1)', target: 'AMM pair contract' },
      manipulation: { target: 'mint() / burn() function using reserve0, reserve1 directly without TWAP' },
      exploitation: { action: 'Mint LP tokens at manipulated reserve ratio → receive excess share; or burn with inflated underlying claim' },
    },
    defenseOverrides: {
      immediate: ['Use cumulative price oracle instead of instant reserves for share calculation', 'Add mint/burn slippage protection (minimum 1% deviation bound)', 'Enforce minimum liquidity before allowing mint/burn operations'],
    },
  },
  'LR-02': {
    name: 'Manipulatable Collateral Ratio Exploit',
    category: 'LR',
    difficulty: 'medium',
    stepOverrides: {
      execution: { action: 'Flash loan to manipulate collateral asset price downward via large swap in thin pool', target: 'Collateral token / AMM pair' },
      manipulation: { target: 'healthFactor / collateralFactor valuation using manipulatable spot price' },
      exploitation: { action: 'Deposit inflated collateral; borrow maximum; self-liquidate to capture remaining collateral' },
    },
    defenseOverrides: {
      immediate: ['Use TWAP for collateral valuation (minimum 30-minute window)', 'Set conservative LTV ratio (max 75% for volatile assets; max 50% for LP tokens)', 'Add oracle freshness validation before permitting liquidations'],
    },
  },
  'LR-03': {
    name: 'TVL/Supply-Driven Reward Manipulation',
    category: 'LR',
    difficulty: 'medium',
    stepOverrides: {
      execution: { action: 'Flash deposit large amount to temporarily inflate totalValueLocked or totalSupply metric', target: 'Reward-bearing protocol contract' },
      manipulation: { target: 'Reward calculation based on instantaneous totalSupply / totalValueLocked' },
      exploitation: { action: 'Claim disproportionate reward share based on inflated deposit; immediately withdraw principal' },
    },
    defenseOverrides: {
      immediate: ['Use time-weighted TVL snapshots (minimum 1-epoch delay)', 'Add minimum stake duration before reward eligibility', 'Implement per-address reward cap relative to pool size'],
    },
  },
  'TO-01': {
    name: 'Missing Deadline MEV Exploit',
    category: 'TO',
    difficulty: 'low',
    stepOverrides: {
      execution: { action: 'Hold victim transaction in mempool indefinitely; execute when profitable due to price movement', target: 'Pending victim transaction without deadline' },
      manipulation: { target: 'swap() / deposit() / withdraw() without deadline parameter' },
      exploitation: { action: 'Execute victims stale transaction at outdated price after market movement; capture arbitrage' },
    },
    defenseOverrides: {
      immediate: ['Add deadline parameter to all swap, deposit, and withdraw functions (5-10 minute protection window)', 'Use block.timestamp > deadline revert at function entry'],
      shortTerm: ['Integrate Flashbots RPC for MEV-protected transaction submission'],
    },
  },
  'TO-02': {
    name: 'Sandwich Attack via Missing Slippage Protection',
    category: 'TO',
    difficulty: 'low',
    stepOverrides: {
      execution: { action: 'Front-run victim swap to inflate pool price; back-run immediately after to capture sandwich spread', target: 'AMM pool order flow' },
      manipulation: { target: 'amountOutMin set to 0 (unbounded slippage tolerance)' },
      exploitation: { action: 'Victim receives maximum slippage; attacker captures entire spread via back-run arbitrage' },
    },
    defenseOverrides: {
      immediate: ['Enforce minimum amountOut parameter with contract-level floor (max 5% slippage)', 'Replace amountOutMin=0 with quote-based expected output calculation'],
      shortTerm: ['Use TWAP-based expected output for slippage bound calculation'],
    },
  },
  'TO-03': {
    name: 'Reentrancy-Based Price State Manipulation',
    category: 'TO',
    difficulty: 'medium',
    stepOverrides: {
      preparation: { actor: 'attacker', action: 'Identify state-variable update occurring after external call without reentrancy lock', target: 'Protocol state management logic' },
      execution: { actor: 'attacker', action: 'Initiate swap/callback; re-enter before reserve/price update; modify price mid-execution', target: 'External call site without ReentrancyGuard' },
      manipulation: { actor: 'protocol', action: 'Stale state re-read during reentrant call; attacker repeats extraction before update', target: 'Price-dependent state variable updated post-call' },
      exploitation: { actor: 'attacker', action: 'Re-enter multiple times extracting value from each stale-state read cycle', target: 'Vulnerable contract' },
      profit: { actor: 'attacker', action: 'Withdraw accumulated extraction from each reentrant iteration', target: 'DEX / contract withdrawal' },
    },
    defenseOverrides: {
      immediate: ['Add OpenZeppelin ReentrancyGuard to all state-mutating external functions', 'Follow Checks-Effects-Interactions pattern: update state before external call', 'Move reserve/price state updates before any external call'],
    },
  },
  'AC-01': {
    name: 'Oracle Address Takeover via Unprotected Setter',
    category: 'AC',
    difficulty: 'low',
    stepOverrides: {
      preparation: { action: 'Identify setOracle / setPriceFeed function protected only by single-signature owner', target: 'Protocol oracle configuration' },
      execution: { action: 'Compromise admin key; call setOracle() to point to attacker-controlled malicious oracle', target: 'Oracle address setter without timelock' },
      exploitation: { action: 'Submit arbitrary malicious prices through attacker-controlled oracle to drain lending/swap markets' },
    },
    defenseOverrides: {
      immediate: ['Add 24-hour timelock to oracle address update function', 'Require multi-signature (3/5 minimum) for oracle address changes', 'Emit OracleUpdated event with monitoring alerts'],
    },
  },
  'AC-02': {
    name: 'Economic Parameter Manipulation via Privilege',
    category: 'AC',
    difficulty: 'medium',
    stepOverrides: {
      execution: { action: 'Modify fee rate, LTV ratio, or interest model to 0 fee / 100% LTV enabling value extraction', target: 'Protocol economic parameter setters (setFee / setLTV / setInterestRate)' },
      exploitation: { action: 'Exploit modified parameters: borrow at 100% LTV with 0% interest; or extract all fees' },
    },
    defenseOverrides: {
      immediate: ['Add timelock (minimum 48 hours) to all economic parameter changes', 'Set maximum permissible change per adjustment (e.g., LTV delta ≤ 10%)', 'Require governance vote with quorum >= 30% for parameter changes'],
    },
  },
  'AC-03': {
    name: 'Unlimited Token Mint/Burn by Privileged Role',
    category: 'AC',
    difficulty: 'low',
    stepOverrides: {
      execution: { action: 'Mint unlimited tokens via privileged minter role without supply cap or mint rate limit', target: 'mint() function with onlyOwner modifier but no maxSupply check' },
      exploitation: { action: 'Dump minted tokens on DEX, crashing price; extract all paired liquidity tokens as profit' },
    },
    defenseOverrides: {
      immediate: ['Add hard cap on total token supply (maxSupply) enforced at mint()', 'Remove burn privilege for user-held tokens', 'Implement minter role with daily mint rate limit'],
    },
  },
  'CL-01': {
    name: 'Precision Rounding Exploit',
    category: 'CL',
    difficulty: 'high',
    stepOverrides: {
      preparation: { action: 'Identify integer division where remainder is truncated in attackers favor (Solidity floor rounding)', target: 'Division-heavy arithmetic functions' },
      execution: { action: 'Execute repeated micro-deposits/withdrawals where truncated remainder accumulates as gain', target: 'Division operation in share or token amount calculation' },
      exploitation: { action: 'Accumulate fractional token gains across thousands of transactions, draining pool by rounding bias' },
    },
    defenseOverrides: {
      immediate: ['Multiply before dividing — avoid premature division precision loss', 'Use PRBMath fixed-point arithmetic library (18-decimal precision)', 'Add minimum operation amount to prevent dust attacks (e.g., < 0.1% of pool)'],
    },
  },
  'CL-02': {
    name: 'Token Decimal Mismatch Exploit',
    category: 'CL',
    difficulty: 'medium',
    stepOverrides: {
      preparation: { action: 'Identify price calculation mixing tokens with different decimal precision (e.g., USDC 6 vs ETH 18)', target: 'Token amount normalization logic' },
      execution: { action: 'Deposit token with unexpected decimals — 6-decimal token valued as 18-decimal due to missing scaling', target: 'Price or amount calculation without normalizeAmount()' },
      exploitation: { action: 'Deposit 1 USDC (6 decimals) valued as 1 ETH (18 decimals) → 10^12× valuation error' },
    },
    defenseOverrides: {
      immediate: ['Normalize all token amounts to 18 decimals before arithmetic (SafeERC20 + scaling factor)', 'Use token.decimals() dynamically — never hardcode 18', 'Add decimal consistency assertion at contract initialization'],
    },
  },
  'CL-03': {
    name: 'AMM Curve Parameterization Exploit',
    category: 'CL',
    difficulty: 'high',
    stepOverrides: {
      preparation: { action: 'Mathematically analyze custom AMM invariant — identify curve region where invariant provides attacker-favorable pricing', target: 'Custom AMM curve function' },
      execution: { action: 'Construct trade sequence pushing AMM to extreme region where invariant produces irrational exchange rate', target: 'AMM swap function without boundary guard' },
      manipulation: { target: 'Custom AMM curve (Solidly, Curve V1 amplification) without region boundary validation' },
      exploitation: { action: 'Execute large swap extracting value from mathematical flaw in curve parameterization' },
    },
    defenseOverrides: {
      immediate: ['Formally verify AMM invariant across full (0, ∞) price range', 'Add maximum trade size relative to pool depth (max 30% of pool)', 'Implement circuit breaker on price movement exceeding 50% in single block'],
    },
  },
  'CR-01': {
    name: 'Single External Price Source Reliance',
    category: 'CR',
    difficulty: 'medium',
    stepOverrides: {
      execution: { action: 'Flash loan manipulate the sole external DEX/oracle price feed on which the protocol depends', target: 'External DEX pair or bridge oracle' },
      manipulation: { target: 'getAmountOut() / getPrice() from single external protocol without fallback' },
      exploitation: { action: 'Execute liquidate / borrow / swap at manipulated external price — no secondary source to reject' },
    },
    defenseOverrides: {
      immediate: ['Add secondary price source with deviation check (reject if > 5% delta)', 'Implement circuit breaker when primary source unavailable or anomalous', 'Use Chainlink or multi-oracle median price aggregation'],
    },
  },
  'CR-02': {
    name: 'LP Token Collateral Valuation Exploit',
    category: 'CR',
    difficulty: 'medium',
    stepOverrides: {
      execution: { action: 'Flash manipulate the AMM pool underlying the LP token to distort its fair composition value', target: 'AMM pair backing the LP token' },
      manipulation: { target: 'collateralValue(lpToken) = spot price × LP shares without verifying underlying composition' },
      exploitation: { action: 'Deposit inflated LP tokens as collateral; borrow maximum against overvalued LP position' },
    },
    defenseOverrides: {
      immediate: ['Calculate LP token value using TWAP of underlying assets — not spot composition', 'Apply collateral haircut to LP tokens (minimum 20% discount to fair value)', 'Verify LP token composition has not been flash-distorted before accepting as collateral'],
    },
  },
  'CR-03': {
    name: 'Unchecked Cross-Protocol Call Exploit',
    category: 'CR',
    difficulty: 'low',
    stepOverrides: {
      execution: { action: 'Call external protocol swap/liquidate function; external call reverts silently but protocol state proceeds', target: 'External protocol call with unchecked return value' },
      manipulation: { target: 'External call without require(success) or return value validation' },
      exploitation: { action: 'Protocol state updated as if external call succeeded — attacker exploits state inconsistency' },
    },
    defenseOverrides: {
      immediate: ['Check all external call return values with require(success, "call failed")', 'Implement post-call state consistency assertion', 'Use SafeERC20 library for all token transfers'],
      shortTerm: ['Add post-interaction invariant checks (e.g., totalSupply before == totalSupply after)', 'Implement try/catch pattern for external calls'],
    },
  },
  'CR-04': {
    name: 'Cross-Protocol Cascading Price Manipulation',
    category: 'CR',
    difficulty: 'high',
    stepOverrides: {
      preparation: { action: 'Map multi-hop price dependency chain: Protocol As price/reserve → Protocol Bs pricing function (depth ≥ 2)', target: 'Cross-protocol call graph' },
      execution: { action: 'Manipulate Protocol As reserves or price via flash loan; distortion propagates to Protocol Bs pricing', target: 'Protocol A (external DEX / oracle)' },
      manipulation: { target: 'Protocol Bs function consuming Protocol As price without cross-protocol deviation check' },
      exploitation: { action: 'Exploit cascaded price distortion across both protocols in single atomic transaction', target: 'Protocol B vulnerable function' },
    },
    defenseOverrides: {
      immediate: ['Add cross-protocol price deviation threshold (reject if Protocol As price differs > 5% from reference)', 'Implement multi-source aggregation for cross-protocol pricing', 'Deploy circuit breaker on cascading dependency when external source anomalous'],
    },
  },
};

// ─── Merge engine ───────────────────────────────────────────────────
// Combines category base template + pattern overlay + per-finding LLM
// data to produce a per-vulnerability specific attack narrative.

function mergeTemplate(
  category: string,
  input: TemplateInput,
): { steps: AttackStep[]; fundFlow: FundFlow[]; defenses: DefenseRecommendation; difficulty: DifficultyLevel; attackName: string } {
  const base = CATEGORY_TEMPLATES[category];
  const overlay = PATTERN_OVERLAYS[input.patternId];

  // Build attack name: overlay name if available, else base category name
  const overlayName = overlay?.name;
  const attackName = overlayName
    ? `${overlayName}: ${input.patternName}`
    : `${base.name}: ${input.patternName}`;

  // Merge steps: base skeleton → overlay overrides → per-finding LLM injection
  const baseSteps = structuredClone(base.steps());
  const overrides = overlay?.stepOverrides ?? {};

  const mergedSteps = baseSteps.map((step) => {
    const override = overrides[step.phase] ?? {};
    const merged = { ...step, ...override };

    // Inject per-finding LLM data into execution phase (primary attack vector)
    if (step.phase === 'execution' && input.attackVector && !override?.action) {
      merged.action = input.attackVector;
    }
    // Inject per-finding description into exploitation phase for concreteness
    if (step.phase === 'exploitation' && input.description) {
      merged.expectedOutcome = input.description.length > 100
        ? input.description.substring(0, 100) + '...'
        : input.description;
    }
    return merged;
  });

  // Merge defenses: base → overlay overrides → per-finding recommendation
  const baseDefenses = structuredClone(base.defenses);
  const defenseOverrides = overlay?.defenseOverrides ?? {};

  const mergedDefenses: DefenseRecommendation = {
    immediate: defenseOverrides.immediate ?? baseDefenses.immediate,
    shortTerm: defenseOverrides.shortTerm ?? baseDefenses.shortTerm,
    longTerm: defenseOverrides.longTerm ?? baseDefenses.longTerm,
  };

  // Inject per-finding LLM recommendation if provided
  if (input.recommendation && !defenseOverrides.immediate) {
    mergedDefenses.immediate = [
      input.recommendation.length > 120 ? input.recommendation.substring(0, 120) + '...' : input.recommendation,
      ...mergedDefenses.immediate,
    ];
  }

  // Merge fund flows: base → overlay overrides
  const mergedFundFlow = overlay?.fundFlowOverrides ?? base.fundFlow();

  // Difficulty: overlay difficulty takes precedence over base
  const difficulty = overlay?.difficulty ?? base.difficulty;

  return { steps: mergedSteps, fundFlow: mergedFundFlow, defenses: mergedDefenses, difficulty, attackName };
}

// ─── Combined attack chains ─────────────────────────────────────────

const COMBINED_CHAINS: Array<{ name: string; pattern: string[] }> = [
  { name: 'Classic Flash Loan to Oracle Chain', pattern: ['LR-01', 'OD-01', 'LR-03'] },
  { name: 'Oracle Feed to Liquidation Chain', pattern: ['OD-03', 'LR-02'] },
  { name: 'Stale Oracle Cascading Chain', pattern: ['OD-04', 'OD-05'] },
  { name: 'MEV Sandwich Chain', pattern: ['TO-01', 'TO-02'] },
  { name: 'Privilege Abuse Cascade', pattern: ['AC-01', 'AC-02', 'OD-03'] },
  { name: 'Cross-Protocol Cascading Chain', pattern: ['CR-01', 'CR-03'] },
  { name: 'Cross-Protocol Indirect Manipulation Chain', pattern: ['CR-04', 'CR-01'] },
];

// ─── Reconstructor class ────────────────────────────────────────────

import type { Vulnerability } from '../../vulnerability-agent';
import type { ReconstructionResult, AttackChain, FeasibilityAssessment, HistoricalAnalogy } from './types';
import { loadHistoryCases } from '@/lib/storage/data';

export class PriceManipulationReconstructor {
  async reconstruct(
    vulnerabilities: Vulnerability[],
    classification: ProtocolClassification,
  ): Promise<ReconstructionResult> {
    const attacks: PriceManipulationAttack[] = [];

    for (const vuln of vulnerabilities) {
      const prefix = getCategoryPrefix(vuln.patternId);
      if (!CATEGORY_TEMPLATES[prefix]) continue;

      const input: TemplateInput = {
        patternId: vuln.patternId,
        patternName: vuln.patternName,
        severity: vuln.severity,
        title: vuln.title,
        description: vuln.description,
        attackVector: vuln.attackVector,
        recommendation: vuln.recommendation,
      };

      const merged = mergeTemplate(prefix, input);
      const feasibility = this.assessFeasibility(vuln, merged.difficulty);
      const historicalAnalogy = await this.findHistoricalAnalogy(vuln);

      attacks.push({
        attackType: vuln.patternId,
        attackName: merged.attackName,
        description: `${vuln.patternId} reconstructed: ${vuln.title}. ${vuln.description}`,
        steps: merged.steps,
        fundFlow: merged.fundFlow,
        feasibility,
        defenses: merged.defenses,
        historicalAnalogy,
      });
    }

    const combinedAttackChains = this.buildCombinedChains(attacks, classification);

    return {
      attacks,
      combinedAttackChains,
      summary: {
        totalAttacks: attacks.length,
        highFeasibility: attacks.filter((a) => a.feasibility.overallFeasibility === 'high').length,
        criticalAttacks: attacks.filter((a) => a.feasibility.overallScore >= 70).length,
      },
    };
  }

  private assessFeasibility(vuln: Vulnerability, defaultDifficulty: DifficultyLevel): FeasibilityAssessment {
    let techScore: number;
    switch (defaultDifficulty) {
      case 'low': techScore = 90; break;
      case 'medium': techScore = 70; break;
      case 'high': techScore = 50; break;
    }

    if (vuln.severity === 'Critical') techScore = Math.min(techScore + 10, 100);
    if (vuln.severity === 'Low' || vuln.severity === 'Informational') techScore = Math.max(techScore - 20, 10);

    const economicScore = vuln.severity === 'Critical' ? 90 : vuln.severity === 'High' ? 70 : 50;

    const hasFlashLoan = vuln.attackVector?.toLowerCase().includes('flash loan') ?? false;
    const isReentrancy = vuln.attackVector?.toLowerCase().includes('reentrancy') ?? false;
    const mevDependency: FeasibilityAssessment['mevDependency'] =
      hasFlashLoan ? 'medium' : isReentrancy ? 'high' : 'low';

    const overallScore = Math.round(techScore * 0.4 + economicScore * 0.6);

    let overallFeasibility: FeasibilityAssessment['overallFeasibility'];
    if (overallScore >= 70) overallFeasibility = 'high';
    else if (overallScore >= 40) overallFeasibility = 'medium';
    else overallFeasibility = 'low';

    return {
      technicalDifficulty: defaultDifficulty,
      technicalScore: techScore,
      economicScore,
      mevDependency,
      overallScore,
      overallFeasibility,
    };
  }

  private async findHistoricalAnalogy(vuln: Vulnerability): Promise<HistoricalAnalogy> {
    try {
      const data = await loadHistoryCases();
      const patternName = vuln.patternName.toLowerCase();
      const patternId = vuln.patternId;

      let bestMatch: HistoricalAnalogy = {
        caseId: 'N/A',
        caseName: 'No matching case found',
        similarity: 0,
        matchReason: 'No historical case with similar pattern',
      };

      for (const c of data.cases) {
        // pattern_ids from M7: JSON field added to history.json for pattern ID alignment
        const patternIds = (c as unknown as Record<string, unknown>).pattern_ids as string[] | undefined;
        const casePattern = c.vulnerability_pattern?.toLowerCase() ?? '';

        let similarity = 0;
        if (patternIds?.includes(patternId)) {
          similarity = 0.9;
        } else if (casePattern) {
          similarity = this.computeSimilarity(patternName, casePattern, vuln.description, c.note ?? '');
        }

        if (similarity > bestMatch.similarity) {
          bestMatch = {
            caseId: c.id,
            caseName: `${c.id} - ${c.blockchain_platform} (${c.time})`,
            similarity: Math.round(similarity * 100) / 100,
            matchReason: patternIds?.includes(patternId)
              ? `Pattern ID ${patternId} matched directly`
              : `Both involve ${vuln.patternName} pattern on ${c.blockchain_platform}.`,
          };
        }
      }

      return bestMatch;
    } catch {
      return {
        caseId: 'N/A',
        caseName: 'Case lookup failed',
        similarity: 0,
        matchReason: 'Could not load historical cases',
      };
    }
  }

  private computeSimilarity(pattern1: string, pattern2: string, desc1: string, desc2: string): number {
    let score = 0;
    if (pattern1 && pattern2 && (pattern1.includes(pattern2) || pattern2.includes(pattern1))) {
      score += 0.6;
    }
    const words1 = new Set(desc1.toLowerCase().split(/\s+/));
    const words2 = new Set(desc2.toLowerCase().split(/\s+/));
    const intersection = [...words1].filter((w) => words2.has(w) && w.length > 4);
    const union = new Set([...words1, ...words2]);
    if (union.size > 0) {
      score += (intersection.length / union.size) * 0.4;
    }
    return Math.min(score, 1.0);
  }

  private buildCombinedChains(attacks: PriceManipulationAttack[], _classification: ProtocolClassification): AttackChain[] {
    const foundTypes = new Set(attacks.map((a) => a.attackType));
    const chains: AttackChain[] = [];

    for (const chain of COMBINED_CHAINS) {
      const applicableTypes = chain.pattern.filter((p) => foundTypes.has(p));
      if (applicableTypes.length >= 2) {
        const avgFeasibility = applicableTypes
          .map((t) => attacks.find((a) => a.attackType === t)?.feasibility.overallScore ?? 0)
          .reduce((sum, s) => sum + s, 0) / applicableTypes.length;

        chains.push({
          name: chain.name,
          steps: applicableTypes.map((t, i) => ({
            attackType: t,
            order: i + 1,
            enablesNext: applicableTypes[i + 1] ?? 'none',
          })),
          combinedFeasibility: Math.round(avgFeasibility),
        });
      }
    }

    return chains.sort((a, b) => b.combinedFeasibility - a.combinedFeasibility);
  }
}
