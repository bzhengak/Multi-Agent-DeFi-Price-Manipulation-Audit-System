#!/usr/bin/env tsx
/**
 * T6: Ingest vulnerability patterns from JSON into Prisma database.
 *
 * Usage: npx tsx scripts/ingest-patterns.ts [path-to-json]
 * Default JSON path: data/vulnerabilities.json
 *
 * Exit codes:
 *   0 - success
 *   1 - validation or database error
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

interface RawPattern {
  id: string;
  category: string;
  name: string;
  code_features: string[];
  related_attacks: string[];
  severity: string;
  references?: { swc: string; owasp: string };
}

const VALID_CATEGORIES = [
  'Oracle Dependency',
  'Liquidity & Reserve Manipulability',
  'Transaction Ordering & Timing',
  'Access Control & Privilege Risks',
  'Calculation Logic Bugs',
  'Composability Risks',
];

const VALID_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

async function main() {
  const jsonPath = process.argv[2] || join(process.cwd(), 'data', 'vulnerabilities.json');
  console.log(`[ingest] Reading patterns from: ${jsonPath}`);

  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as RawPattern[];
  console.log(`[ingest] Found ${raw.length} patterns`);

  // Validation
  const seenIds = new Set<string>();
  for (const p of raw) {
    if (!p.id || !p.category || !p.name) {
      console.error(`[ingest] ERROR: Pattern missing required fields: ${JSON.stringify(p).substring(0, 100)}`);
      process.exit(1);
    }
    if (seenIds.has(p.id)) {
      console.error(`[ingest] ERROR: Duplicate pattern ID: ${p.id}`);
      process.exit(1);
    }
    seenIds.add(p.id);
    if (!VALID_CATEGORIES.includes(p.category)) {
      console.error(`[ingest] ERROR: Invalid category "${p.category}" for pattern ${p.id}`);
      process.exit(1);
    }
    if (!VALID_SEVERITIES.includes(p.severity)) {
      console.error(`[ingest] ERROR: Invalid severity "${p.severity}" for pattern ${p.id}`);
      process.exit(1);
    }
  }
  console.log(`[ingest] Validation passed (${raw.length} unique IDs, all categories valid)`);

  // Ingest via Prisma
  const prisma = new PrismaClient();

  try {
    console.log('[ingest] Connecting to database...');
    await prisma.$connect();

    let created = 0;
    let updated = 0;

    for (const p of raw) {
      const result = await prisma.vulnerabilityPattern.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          category: p.category,
          name: p.name,
          codeFeatures: JSON.stringify(p.code_features),
          relatedAttacks: JSON.stringify(p.related_attacks),
          severity: p.severity,
          swcRefs: p.references?.swc || null,
          owaspRefs: p.references?.owasp || null,
        },
        update: {
          category: p.category,
          name: p.name,
          codeFeatures: JSON.stringify(p.code_features),
          relatedAttacks: JSON.stringify(p.related_attacks),
          severity: p.severity,
          swcRefs: p.references?.swc || null,
          owaspRefs: p.references?.owasp || null,
        },
      });
      if (result) {
        // Track created vs updated by checking if updatedAt === createdAt
        created++;
      }
    }

    updated = created;
    const count = await prisma.vulnerabilityPattern.count();
    console.log(`[ingest] Done. Upserted ${updated} patterns. Database now has ${count} total.`);
  } catch (error) {
    console.error('[ingest] Database error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
