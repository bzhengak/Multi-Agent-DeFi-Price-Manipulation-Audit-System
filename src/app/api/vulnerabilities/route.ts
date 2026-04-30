import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/jwt';
import { loadVulnerabilityPatterns } from '@/lib/storage/data';

export async function GET() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const data = await loadVulnerabilityPatterns();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Vulnerability patterns API error:', error);
    return NextResponse.json(
      { error: '获取漏洞模式失败' },
      { status: 500 }
    );
  }
}
