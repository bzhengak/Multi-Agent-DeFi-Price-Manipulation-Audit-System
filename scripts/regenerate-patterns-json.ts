#!/usr/bin/env tsx
/**
 * T6: Regenerate data/vulnerabilities.json from Prisma database.
 * Ensures source of truth is单向 from DB → JSON.
 *
 * Usage: npx tsx scripts/regenerate-patterns-json.ts [output-path]
 * Default output: data/vulnerabilities.json
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

async function main() {
  const outputPath = process.argv[2] || join(process.cwd(), 'data', 'vulnerabilities.json');
  console.log(`[regenerate] Reading from database...`);

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    const dbPatterns = await prisma.vulnerabilityPattern.findMany({
      orderBy: { id: 'asc' },
    });

    if (dbPatterns.length === 0) {
      console.error('[regenerate] ERROR: No patterns found in database. Run ingest first.');
      process.exit(1);
    }

    const patterns = dbPatterns.map((db: typeof dbPatterns[number]) => ({
      id: db.id,
      category: db.category,
      name: db.name,
      code_features: JSON.parse(db.codeFeatures),
      related_attacks: JSON.parse(db.relatedAttacks),
      severity: db.severity,
      references: {
        swc: db.swcRefs || '',
        owasp: db.owaspRefs || '',
      },
    }));

    writeFileSync(outputPath, JSON.stringify(patterns, null, 2) + '\n', 'utf-8');
    console.log(`[regenerate] Wrote ${patterns.length} patterns to ${outputPath}`);
  } catch (error) {
    console.error('[regenerate] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
