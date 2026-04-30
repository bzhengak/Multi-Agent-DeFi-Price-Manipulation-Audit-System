import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/jwt';
import { loadHistoryCases } from '@/lib/storage/data';

export async function GET(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
    const chain = searchParams.get('chain') || '';
    const search = searchParams.get('search') || '';

    const data = await loadHistoryCases();
    let filteredCases = data.cases;

    // Filter by chain
    if (chain) {
      filteredCases = filteredCases.filter(
        (c) => c.blockchain_platform.toLowerCase() === chain.toLowerCase()
      );
    }

    // Search by note or id
    if (search) {
      const searchLower = search.toLowerCase();
      filteredCases = filteredCases.filter(
        (c) =>
          c.note?.toLowerCase().includes(searchLower) ||
          c.id.toLowerCase().includes(searchLower) ||
          c.blockchain_platform.toLowerCase().includes(searchLower)
      );
    }

    // Paginate
    const total = filteredCases.length;
    const start = (page - 1) * pageSize;
    const paginatedCases = filteredCases.slice(start, start + pageSize);

    return NextResponse.json({
      cases: paginatedCases,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Cases API error:', error);
    return NextResponse.json(
      { error: '获取案例数据失败' },
      { status: 500 }
    );
  }
}
