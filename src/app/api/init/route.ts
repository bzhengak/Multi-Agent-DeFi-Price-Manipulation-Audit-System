import { NextResponse } from 'next/server';
import { saveJSON, loadJSON } from '@/lib/storage/blob';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Initialize storage with data from the data/ directory
 */
export async function POST() {
  try {
    const dataDir = path.join(process.cwd(), 'data');

    // Initialize history.json - always reload from data dir to pick up updates
    const historyPath = path.join(dataDir, 'history.json');
    if (fs.existsSync(historyPath)) {
      const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      await saveJSON('history.json', historyData);
      console.log('Initialized/updated history.json');
    }

    // Initialize vulnerabilities.json - always reload from data dir to pick up updates
    const vulnPath = path.join(dataDir, 'vulnerabilities.json');
    if (fs.existsSync(vulnPath)) {
      const vulnData = JSON.parse(fs.readFileSync(vulnPath, 'utf-8'));
      await saveJSON('vulnerabilities.json', vulnData);
      console.log('Initialized/updated vulnerabilities.json');
    }

    // Initialize analysis_history.json
    const existingHistory = await loadJSON('analysis_history.json');
    if (!existingHistory) {
      await saveJSON('analysis_history.json', { records: [] });
      console.log('Initialized analysis_history.json');
    }

    // Initialize tasks.json
    const existingTasks = await loadJSON('tasks.json');
    if (!existingTasks) {
      await saveJSON('tasks.json', {});
      console.log('Initialized tasks.json');
    }

    return NextResponse.json({ success: true, message: '数据初始化完成' });
  } catch (error) {
    console.error('Init error:', error);
    return NextResponse.json(
      { error: '数据初始化失败' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Check if data is initialized
    const history = await loadJSON('history.json');
    const vuln = await loadJSON('vulnerabilities.json');
    const analysisHistory = await loadJSON('analysis_history.json');

    return NextResponse.json({
      initialized: !!(history && vuln),
      hasHistory: !!history,
      hasVulnerabilities: !!vuln,
      hasAnalysisHistory: !!analysisHistory,
    });
  } catch (error) {
    return NextResponse.json({ initialized: false });
  }
}
