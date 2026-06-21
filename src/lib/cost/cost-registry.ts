import { ToolRegistry } from '@/lib/agents/core/tools/registry';
import { createGasPriceTool } from './tools/gas-price.tool';
import { createNativePriceTool } from './tools/native-price.tool';
import { createFlashLoanFeeTool } from './tools/flash-loan-fee.tool';

let instance: ToolRegistry | null = null;

export function getCostRegistry(): ToolRegistry {
  if (!instance) {
    instance = new ToolRegistry();
    instance.register(createGasPriceTool());
    instance.register(createNativePriceTool());
    instance.register(createFlashLoanFeeTool());
  }
  return instance;
}
