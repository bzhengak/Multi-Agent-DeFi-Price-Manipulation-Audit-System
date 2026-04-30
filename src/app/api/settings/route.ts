import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/jwt';
import { loadSettings, saveSettings, maskSecret } from '@/lib/storage/settings';
import { verifyPassword, hashPassword } from '@/lib/auth/jwt';
import { getLLMMode } from '@/lib/llm';

export async function GET() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const settings = await loadSettings();

    // Return settings with masked secrets
    // V2: 统一使用 ETHERSCAN_API_KEY
    const unifiedApiKey = settings.etherscanApiKey || process.env.ETHERSCAN_API_KEY;

    return NextResponse.json({
      // V2 统一 API Key
      etherscanApiKey: maskSecret(unifiedApiKey),
      // Per-chain keys (向后兼容)
      bscscanApiKey: maskSecret(settings.bscscanApiKey || process.env.BSCSCAN_API_KEY),
      arbiscanApiKey: maskSecret(settings.arbiscanApiKey || process.env.ARBISCAN_API_KEY),
      basescanApiKey: maskSecret(settings.basescanApiKey || process.env.BASESCAN_API_KEY),
      llmModel: settings.llmModel || process.env.LLM_MODEL || 'qwen3.5-plus',
      hasPassword: !!(settings.passwordHash || process.env.USER_PASSWORD_HASH),
      apiVersion: 'v2',
      llmMode: getLLMMode(),
      // Indicate which keys are configured (without revealing values)
      apiKeysStatus: {
        unified: !!unifiedApiKey,
        ethereum: !!unifiedApiKey,
        bsc: !!(settings.bscscanApiKey || process.env.BSCSCAN_API_KEY || unifiedApiKey),
        arbitrum: !!(settings.arbiscanApiKey || process.env.ARBISCAN_API_KEY || unifiedApiKey),
        base: !!(settings.basescanApiKey || process.env.BASESCAN_API_KEY || unifiedApiKey),
        opbnb: !!(settings.bscscanApiKey || process.env.BSCSCAN_API_KEY || unifiedApiKey),
      },
    });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const body = await request.json();
    const currentSettings = await loadSettings();

    // Handle password change
    if (body.action === 'changePassword') {
      const { oldPassword, newPassword } = body;
      if (!oldPassword || !newPassword) {
        return NextResponse.json({ error: '请输入旧密码和新密码' }, { status: 400 });
      }
      if (newPassword.length < 4) {
        return NextResponse.json({ error: '新密码至少4个字符' }, { status: 400 });
      }

      // Verify old password
      const isValid = await verifyPassword(oldPassword);
      if (!isValid) {
        return NextResponse.json({ error: '旧密码不正确' }, { status: 401 });
      }

      // Hash and save new password
      const newHash = await hashPassword(newPassword);
      currentSettings.passwordHash = newHash;
      await saveSettings(currentSettings);

      return NextResponse.json({ success: true, message: '密码已更新' });
    }

    // Handle API keys update (V2: 统一 key + per-chain keys)
    if (body.action === 'updateApiKeys') {
      const { etherscanApiKey, bscscanApiKey, arbiscanApiKey, basescanApiKey } = body;

      // V2 统一 API Key
      if (etherscanApiKey && !etherscanApiKey.includes('••')) {
        currentSettings.etherscanApiKey = etherscanApiKey.trim();
      }
      // Per-chain keys (向后兼容)
      if (bscscanApiKey && !bscscanApiKey.includes('••')) {
        currentSettings.bscscanApiKey = bscscanApiKey.trim();
      }
      if (arbiscanApiKey && !arbiscanApiKey.includes('••')) {
        currentSettings.arbiscanApiKey = arbiscanApiKey.trim();
      }
      if (basescanApiKey && !basescanApiKey.includes('••')) {
        currentSettings.basescanApiKey = basescanApiKey.trim();
      }

      await saveSettings(currentSettings);
      return NextResponse.json({ success: true, message: 'API Key 已更新 (V2 统一端点)' });
    }

    // Handle LLM model update
    if (body.action === 'updateLlmModel') {
      const { llmModel } = body;
      if (llmModel) {
        currentSettings.llmModel = llmModel.trim();
        await saveSettings(currentSettings);
        return NextResponse.json({ success: true, message: 'LLM模型已更新' });
      }
      return NextResponse.json({ error: '请指定模型名称' }, { status: 400 });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: '更新设置失败' }, { status: 500 });
  }
}
