import type { PocEvalCase } from './types';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/SunWeb3Sec/DeFiHackLabs/main/src/test';

export function extractPocUrl(dataResource: string): { url: string; fileName: string } | null {
  const match = dataResource.match(
    /github\.com\/SunWeb3Sec\/DeFiHackLabs\/blob\/main\/(src\/test\/[\w\/-]+\.sol)/,
  );
  if (match) {
    const filePath = match[1];
    const fileName = filePath.split('/').pop() || 'unknown.sol';
    return {
      url: `${GITHUB_RAW_BASE}/${filePath.replace('src/test/', '')}`,
      fileName,
    };
  }
  return null;
}

export async function downloadReferencePoc(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }
  return response.text();
}
