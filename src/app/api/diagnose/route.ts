import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/jwt';
import { loadSettings } from '@/lib/storage/settings';
import { BLOCKCHAIN_CONFIG } from '@/lib/blockchain/config';
import { etherscanUrlSafe } from '@/lib/blockchain/fetcher';

/**
 * Diagnose Etherscan V2 API connectivity.
 * Tests a simple API call (getblocknumber) using the configured API key.
 */
export async function GET() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get API key from settings or env
    const settings = await loadSettings();
    const apiKey = settings.etherscanApiKey || process.env.ETHERSCAN_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: 'Etherscan API Key not configured',
        details: 'Please configure API Key in Settings or set ETHERSCAN_API_KEY in .env',
      });
    }

    // Test V2 API by getting the current block number on Ethereum (chainid=1)
    const ethereumConfig = BLOCKCHAIN_CONFIG.ethereum;
    const testUrl = etherscanUrlSafe(
      ethereumConfig.chainId,
      {
        module: 'proxy',
        action: 'eth_blockNumber',
      },
      apiKey
    );

    const startTime = Date.now();
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    const latency = Date.now() - startTime;

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        message: `API request failed (HTTP ${response.status})`,
        details: `Etherscan V2 API returned non-200 status code`,
        latency,
      });
    }

    const data = await response.json();

    // Check for V2-specific errors
    if (data.result && typeof data.result === 'string' && data.result.includes('Missing chainid')) {
      return NextResponse.json({
        success: false,
        message: 'V2 API parameter error: missing chainid',
        details: 'API returned Missing chainid parameter error',
        latency,
      });
    }

    if (data.result && typeof data.result === 'string' && data.result.includes('Invalid API Key')) {
      return NextResponse.json({
        success: false,
        message: 'Invalid API Key',
        details: 'Etherscan returned Invalid API Key error',
        latency,
      });
    }

    if (data.result && typeof data.result === 'string' && data.result.includes('Max rate limit')) {
      return NextResponse.json({
        success: false,
        message: 'API rate limit exceeded',
        details: 'Etherscan API rate limit reached, please try again later',
        latency,
      });
    }

    // Successful response - eth_blockNumber returns hex block number
    if (data.result && typeof data.result === 'string' && data.result.startsWith('0x')) {
      const blockNumber = parseInt(data.result, 16);
      return NextResponse.json({
        success: true,
        message: 'Etherscan V2 API connection OK',
        details: `Successfully connected to Etherscan V2 unified API (chainid=${ethereumConfig.chainId})`,
        latency,
        blockNumber,
        apiVersion: 'v2',
      });
    }

    // Fallback: unknown response format but no error
    return NextResponse.json({
      success: true,
      message: 'Etherscan V2 API responded',
      details: 'Received API response, but format is not expected eth_blockNumber',
      latency,
      apiVersion: 'v2',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      message: 'Connection test failed',
      details: `Cannot connect to Etherscan V2 API: ${message}`,
    });
  }
}
