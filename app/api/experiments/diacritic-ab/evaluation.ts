import crypto from 'crypto';
import { RATES } from './constants';
import { ArmResult, DiacriticCase, ExperimentArm } from './types';

function normalized(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function whitespaceNormalized(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export interface MechanicalRow {
  arm: ExperimentArm;
  id: string;
  noOp: boolean;
  exactRestoration: boolean | null;
  restorationDifference: { expected: string; actual: string } | null;
  controlPreserved: boolean | null;
}

export function mechanicalRows(cases: DiacriticCase[], arms: ArmResult[]): MechanicalRow[] {
  const byId = new Map(cases.map(item => [item.id, item]));
  return arms.flatMap(arm =>
    arm.outputs.map(output => {
      const item = byId.get(output.id)!;
      const candidate = output.english ?? output.restoredVi;
      const exactRestoration =
        item.canonicalVietnamese == null || output.restoredVi == null
          ? null
          : output.restoredVi === item.canonicalVietnamese;
      return {
        arm: arm.arm,
        id: output.id,
        noOp:
          output.status !== 'ambiguous' && normalized(candidate) === normalized(item.asciiInput),
        exactRestoration,
        restorationDifference:
          exactRestoration === false
            ? { expected: item.canonicalVietnamese!, actual: output.restoredVi! }
            : null,
        controlPreserved:
          item.category === 'control'
            ? whitespaceNormalized(candidate) === whitespaceNormalized(item.asciiInput)
            : null,
      };
    })
  );
}

export function observedCost(arms: ArmResult[]): { usd: number; complete: boolean } {
  let usd = 0;
  for (const arm of arms) {
    if (arm.usage != null) {
      usd += (arm.usage.promptTokens * RATES.doInputUsdPerMillionTokens) / 1_000_000;
      usd += (arm.usage.completionTokens * RATES.doOutputUsdPerMillionTokens) / 1_000_000;
    }
    if (arm.googleSourceCharacters != null) {
      usd += (arm.googleSourceCharacters * RATES.googleUsdPerMillionCharacters) / 1_000_000;
    }
  }
  return { usd, complete: arms.length === 4 };
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function blindResults(
  cases: DiacriticCase[],
  arms: ArmResult[]
): { mapping: Record<string, ExperimentArm>; review: string } {
  const armNames = shuffled(arms.map(arm => arm.arm));
  const labels = ['A', 'B', 'C', 'D'];
  const mapping = Object.fromEntries(
    labels.map((label, index) => [label, armNames[index]])
  ) as Record<string, ExperimentArm>;
  const armByName = new Map(arms.map(arm => [arm.arm, arm]));
  const rows = shuffled(
    labels.flatMap(label => {
      const arm = armByName.get(mapping[label])!;
      return arm.outputs.map(output => ({ label, output }));
    })
  );
  const byId = new Map(cases.map(item => [item.id, item]));
  const lines = [
    '# Vietnamese diacritic A/B review',
    '',
    'Score each row: 0 wrong, 1 related, 2 correct, 3 natural. Do not unblind arm labels until grading is complete.',
    '',
    '| Row | Case | Input | Arm | Restored Vietnamese | English | Status / alternatives | Score | VI acceptable? | EN acceptable? | Ambiguity justified? | Harmful confidence? | Correction |',
    '| ---: | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |',
  ];
  rows.forEach(({ label, output }, index) => {
    const input = byId.get(output.id)!.asciiInput;
    const status =
      output.status === 'ambiguous' ? `ambiguous: ${output.alternatives.join('; ')}` : 'resolved';
    const cells = [
      index + 1,
      output.id,
      input,
      label,
      output.restoredVi ?? '—',
      output.english ?? '—',
      status,
    ];
    lines.push(
      `| ${cells.map(value => String(value).replace(/\|/g, '\\|')).join(' | ')} |  |  |  |  |  |  |`
    );
  });
  return { mapping, review: `${lines.join('\n')}\n` };
}
