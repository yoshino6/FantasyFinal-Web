import type { SkillCandidateAction, SkillInfo, SkillSpecialization, SkillSpecializationDetail } from './skill-api';

const names: Record<SkillSpecialization, string> = { overcharge: '过充', potent: '强效', instant: '瞬息', efficient: '节能' };
const masteryCodes = new Set(['longsword_mastery', 'shield_mastery', 'staff_mastery', 'spellbook_mastery',
  'orb_mastery', 'dagger_mastery', 'fistblade_mastery', 'bow_crossbow_mastery', 'gun_mastery']);
const masteryLabels: Record<string, string> = {
  physicalAttackPct: '物攻', magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防',
  accuracyPct: '命中', critRatePct: '暴击', critDamagePct: '暴伤', critResistPct: '暴免',
  critDamageReductionPct: '暴抗', mpPct: '魔力上限', chantSpeedPct: '吟唱速度'
};
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const jsonNumber = (value: unknown) => value === undefined ? undefined : number(Number(value));
const textNumber = (value: number) => String(Number(value.toFixed(4)));
const levelOf = (value: unknown, maximum: number | null) => Math.min(maximum ?? Infinity, Math.max(1, Math.floor(number(value) ?? 1)));
const maximumOf = (value: SkillInfo) => {
  const maximum = number(value.specializationMaxLevel);
  if (maximum !== undefined && maximum >= 1) return Math.floor(maximum);
  return value.tier === '基础' ? 10 : value.tier === '下位' ? 20 : ['中位', '上位', '超位'].includes(value.tier) ? 40 : null;
};
const hasEffect = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
  && !/待(?:服务器)?提供|待服务器返回/.test(value);
const record = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === 'string') { try { return record(JSON.parse(value)); } catch { return undefined; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
};
const matchingAction = (value: SkillInfo, actions: SkillCandidateAction[], row: Pick<SkillSpecializationDetail, 'action' | 'specialization' | 'direction'>) =>
  actions.find(action => action.skillId === value.id && action.action === row.action
    && action.specialization === row.specialization && action.direction === row.direction);
const upgradeCost = (value: SkillInfo, actions: SkillCandidateAction[], row: SkillSpecializationDetail, fallback: number) => {
  if (row.maxLevel !== null && row.level >= row.maxLevel) return null;
  const quoted = number(matchingAction(value, actions, row)?.quote?.result.cost);
  if (quoted !== undefined && quoted >= 0) return quoted;
  if (row.specialization) {
    const costs = value.specializationUpgradeCosts ?? {};
    if (Object.prototype.hasOwnProperty.call(costs, row.specialization)) {
      const cost = costs[row.specialization];
      if (cost === null) return null;
      if (number(cost) !== undefined && cost! >= 0) return cost!;
    }
    const masteryCost = row.specialization === 'overcharge' ? value.masteryProficiencyCost
      : row.specialization === 'instant' ? value.masteryFocusCost : undefined;
    if (number(masteryCost) !== undefined && masteryCost! >= 0 && (value.weaponMastery || masteryCodes.has(value.code))) return masteryCost!;
  }
  return fallback;
};
const finishRow = (value: SkillInfo, actions: SkillCandidateAction[], row: SkillSpecializationDetail, fallbackCost: number) => ({
  ...row, nextEffect: row.maxLevel !== null && row.level >= row.maxLevel ? null : row.nextEffect,
  cost: upgradeCost(value, actions, row, fallbackCost)
});

// These display calculations match skill-specialization.ts. Missing bases must
// not be recovered from rounded actualPower/actualManaCost/turn counts.
const timeAt = (base: number, factor: number) => {
  const original = Math.max(0, base), delta = (original + 1) * (factor - 1);
  return Math.max(0, original + Math.sign(delta) * Math.floor(Math.abs(delta) + 1e-9));
};
const activeValues = (value: SkillInfo, levels: SkillInfo['specializations'], maximum: number | null) => {
  const points = (key: SkillSpecialization) => levelOf(levels[key], maximum) - 1;
  const potentFactor = 1.06 ** points('potent'), timeFactor = .94 ** points('instant');
  const manaFactor = 1.12 ** (points('overcharge') + points('potent') + points('instant')) * .88 ** points('efficient');
  const mana = number(value.baseManaCost), power = number(value.basePower);
  const cooldown = number(value.baseCooldown), chant = number(value.baseChant);
  return {
    power: power === undefined ? undefined : Math.floor(power * 1.06 ** points('overcharge')),
    mana: value.code === 'resident_d01' ? 500 : mana === undefined ? undefined : mana > 0 ? Math.max(1, Math.ceil(mana * manaFactor - 1e-9)) : 0,
    cooldown: cooldown === undefined ? undefined : timeAt(cooldown, timeFactor),
    chant: chant === undefined ? undefined : timeAt(chant, timeFactor), potentFactor, timeFactor
  };
};
const manaText = (value: SkillInfo, mana: number | undefined, key?: SkillSpecialization) => {
  if (value.code === 'resident_d01') return '蓝耗 500 MP＋施法前当前 MP 的8%';
  if (mana !== undefined) return `蓝耗 ${mana} MP`;
  if (value.actualManaCost === 0) return '蓝耗 0 MP';
  return key === 'efficient' ? '蓝耗基数×0.88（合算其他方向后向上取整）'
    : key ? '蓝耗基数×1.12（合算其他方向后向上取整）' : '蓝耗数据未返回';
};
const activeEffect = (value: SkillInfo, key: SkillSpecialization, values: ReturnType<typeof activeValues>, next: boolean) => {
  const numeric = (current: unknown, computed: number | undefined) => next ? computed : number(current) ?? computed;
  const mana = manaText(value, numeric(value.actualManaCost, values.mana), next ? key : undefined);
  if (key === 'overcharge') {
    const power = numeric(value.actualPower, values.power);
    return `${power === undefined ? '威力基数×1.06（合算后向下取整）' : `威力 ${power}`}；${mana}。`;
  }
  if (key === 'potent') return `普通效果×${textNumber(values.potentFactor)}；可成长时长×${textNumber(values.potentFactor)}；控制概率系数×${textNumber(values.potentFactor)}；${mana}（受各效果适用范围与上限限制）。`;
  if (key === 'instant') {
    const cooldown = numeric(value.actualCooldown, values.cooldown), chant = numeric(value.actualChant, values.chant);
    const turns = [cooldown === undefined ? null : `冷却 ${cooldown} 回合`, chant === undefined ? null : `吟唱 ${chant} 回合`].filter(Boolean);
    if (cooldown === undefined || chant === undefined) turns.push('冷却与吟唱按基础回合及向零取整规则结算');
    return `${turns.join('；')}；时间基数×${textNumber(values.timeFactor)}；${mana}。`;
  }
  return `${mana}。`;
};
const passiveFactor = (level: number, maximum: number | null) => {
  let factor = 1;
  for (let point = 1; point <= levelOf(level, maximum) - 1; point++) factor *= 1 + .015 * Math.max(.25, .9 ** (point - 1));
  return Math.min(1.25, factor);
};

/** Prefer server descriptions; reconstruct legacy responses only from known
 * levels, actual values and optional unrounded bases. Never guess next values
 * by multiplying the already-rounded current values. */
export function specializationDisplayRows(value: SkillInfo, actions: SkillCandidateAction[]): SkillSpecializationDetail[] {
  if (!value.learned) return [];
  const levels = { ...value.specializations }, maximum = maximumOf(value);
  for (const action of actions) {
    if (action.skillId !== value.id || action.action !== 'specialization' || !action.specialization
      || levels[action.specialization] !== undefined) continue;
    const nextLevel = number(action.quote?.result.level);
    if (nextLevel !== undefined && nextLevel >= 2) levels[action.specialization] = nextLevel - 1;
  }
  let fallback: SkillSpecializationDetail[];
  if (value.code === 'appraisal') {
    const information = ['名称、生命、魔力、技能', '词条、详细属性', '当前状态、目标仇恨、域民资料', '弱点、抗性、完整怪物图鉴'];
    fallback = (['range', 'information'] as const).map(direction => {
      const maxLevel = direction === 'range' ? 10 : 4;
      const action = actions.find(item => item.skillId === value.id && item.action === 'appraisal' && item.direction === direction);
      const field = direction === 'range' ? 'rangeLevel' : 'informationLevel';
      // Appraisal quotes use result.level for the overall skill, not this direction.
      const quotedLevel = number(action?.quote?.result[field]);
      const level = levelOf(value.appraisal?.[field] ?? (quotedLevel === undefined ? undefined : quotedLevel - 1), maxLevel);
      const effect = (current: number) => {
        if (direction === 'information') return information.slice(0, current).join('；') + '。';
        return `可鉴识高于自身 ${current * 3} 级以内的目标。`;
      };
      const row: SkillSpecializationDetail = { key: direction, name: direction === 'range' ? '慧眼' : '识珠',
        level, maxLevel, currentEffect: effect(level), nextEffect: effect(level + 1), cost: null, action: 'appraisal', direction };
      return finishRow(value, actions, row, direction === 'range' ? level : level + 1);
    });
  } else if (value.weaponMastery || masteryCodes.has(value.code)) {
    const effect = record(value.passiveEffect);
    fallback = (['overcharge', 'instant'] as const).map(key => {
      const maxLevel = key === 'overcharge' ? 5 : 6, level = levelOf(levels[key], maxLevel);
      const describe = (current: number) => {
        if (key === 'instant') return `对应副手精通与主、副词条发挥 ${textNumber((current + 4) * 10)}%；装备特殊效果保持完整。`;
        if (!effect) return `娴熟 Lv.${current}；成长只作用于该精通声明的属性，副手按随心比例发挥。`;
        const attributes = Object.keys(masteryLabels).filter(name => (jsonNumber(effect[name]) ?? 0) !== 0).map(name => {
          const amount = jsonNumber(effect[name])! + (jsonNumber(effect.masteryStepPct) ?? 0) * (current - 1);
          return `${masteryLabels[name]}${amount >= 0 ? '+' : ''}${textNumber(amount)}%`;
        });
        return `每把${String(effect.weaponType ?? '对应武器')}：${attributes.join('、') || '无声明的数值加成'}；副手按随心比例发挥。`;
      };
      const row: SkillSpecializationDetail = { key, name: key === 'overcharge' ? '娴熟' : '随心', level, maxLevel,
        currentEffect: describe(level), nextEffect: describe(level + 1), cost: null, action: 'specialization', specialization: key };
      return finishRow(value, actions, row, level * 2);
    });
  } else if (value.passiveSpecializable || ['passive', 'bound'].includes(value.category)
    && actions.some(action => action.skillId === value.id && action.action === 'specialization' && action.specialization === 'potent')) {
    const level = levelOf(levels.potent, maximum);
    const describe = (current: number) => `可成长数值 +${textNumber((passiveFactor(current, maximum) - 1) * 100)}%；次数、时长与机制保持不变。`;
    const row: SkillSpecializationDetail = { key: 'potent', name: '强效', level, maxLevel: maximum,
      currentEffect: describe(level), nextEffect: describe(level + 1), cost: null, action: 'specialization', specialization: 'potent' };
    fallback = [finishRow(value, actions, row, 1)];
  } else if (['passive', 'bound'].includes(value.category)) fallback = [];
  else {
    const choices = new Set([...(value.specializationChoices ?? []), ...actions.filter(action => action.skillId === value.id && action.action === 'specialization').map(action => action.specialization)]);
    fallback = [...choices].filter((key): key is SkillSpecialization => Boolean(key && key in names)).map(key => {
      const level = levelOf(levels[key], maximum), current = activeValues(value, levels, maximum);
      const next = activeValues(value, { ...levels, [key]: level + 1 }, maximum);
      const quote = matchingAction(value, actions, { action: 'specialization', specialization: key })?.quote?.result;
      // Future/legacy action quotes may already include the preview's exact values.
      next.power = number(quote?.actualPower) ?? next.power;
      next.mana = number(quote?.actualManaCost) ?? next.mana;
      next.cooldown = number(quote?.actualCooldown) ?? next.cooldown;
      next.chant = number(quote?.actualChant) ?? next.chant;
      const row: SkillSpecializationDetail = { key, name: names[key], level, maxLevel: maximum,
        currentEffect: activeEffect(value, key, current, false), nextEffect: activeEffect(value, key, next, true),
        cost: null, action: 'specialization', specialization: key };
      return finishRow(value, actions, row, level);
    });
  }
  const serverRows = (value.specializationDetails ?? []).filter(row => hasEffect(row.currentEffect));
  if (!serverRows.length) return fallback;
  const completeRows = serverRows.map(row => {
    const known = fallback.find(item => item.key === row.key && item.level === row.level);
    if (!known || row.maxLevel !== null && row.level >= row.maxLevel || hasEffect(row.nextEffect) || !hasEffect(known.nextEffect)) return row;
    return { ...row, nextEffect: known.nextEffect };
  });
  return [...completeRows, ...fallback.filter(row => !serverRows.some(server => server.key === row.key))];
}
