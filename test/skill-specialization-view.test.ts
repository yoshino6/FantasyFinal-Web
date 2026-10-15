import assert from 'node:assert/strict';
import test from 'node:test';
import { specializationDisplayRows } from '../src/skill-specialization-view';
import type { SkillCandidateAction, SkillInfo } from '../src/skill-api';
import { skillSpecializationDetails } from '../../server/src/app-api/skill-specialization-details';
import { skillSpecialization } from '../../server/src/game/skill-specialization';

const fixture = (overrides: Partial<SkillInfo> = {}): SkillInfo => ({
  id: 7, code: 'test', name: '测试技能', category: 'magic', tier: '基础', description: '',
  learned: true, level: 1, maxLevel: 37, skillPoints: 0, learnCost: 1, nextUpgradeCost: null,
  skillKind: '', element: '', rangeType: 'single', targetScope: 'enemy', requiredWeaponType: null,
  actualPower: 150, actualManaCost: 300, actualCooldown: 3, actualChant: 1,
  quickSlot: null, passiveLinked: false, specializations: {},
  specializationChoices: ['overcharge', 'potent', 'instant', 'efficient'], specializationUpgradeCosts: {},
  specializationMaxLevel: 10, masteryProficiencyCost: null, masteryFocusCost: null,
  passiveSpecializable: false, appraisal: null, effectDetails: [], ...overrides
});
const action = (overrides: Partial<SkillCandidateAction> = {}): SkillCandidateAction => ({
  action: 'specialization', skillId: 7, specialization: 'overcharge', enabled: true,
  quote: { action: 'specialization', skillId: 7, skillPointsBefore: 100, skillPointsAfter: 98, result: { level: 3, cost: 2 } },
  ...overrides
});

test('真实非空服务器细节优先；空数组、空行与旧占位从实际数据补全，不修改入参', () => {
  const serverRow = { key: 'overcharge', name: '服务器命名', level: 2, maxLevel: 10,
    currentEffect: '威力 173；蓝耗 337 MP。', nextEffect: '服务器精确下级。', cost: 2,
    action: 'specialization' as const, specialization: 'overcharge' as const };
  const value = fixture({ specializationDetails: [serverRow] });
  const before = JSON.stringify(value);
  assert.strictEqual(specializationDisplayRows(value, [])[0], serverRow);
  assert.equal(JSON.stringify(value), before);
  for (const specializationDetails of [[], [{ ...serverRow, currentEffect: '' }], [{ ...serverRow, currentEffect: '当前效果待服务器提供' }]]) {
    assert.equal(specializationDisplayRows(fixture({ specializationDetails }), [])[0].currentEffect, '威力 150；蓝耗 300 MP。');
  }
});

test('基础数值存在时四方向当前与下级逐字匹配服务端合算和取整', () => {
  for (const tier of ['基础', '下位', '中位']) {
    const base = { code: 'test', category: 'magic', tier, power: 101, mana_cost: 3, cooldown_turns: 3, chant_turns: 1 };
    const levels = { overcharge: 2, potent: 3, instant: 5, efficient: 8 };
    const actual = skillSpecialization(base, levels);
    const value = fixture({ tier, specializationMaxLevel: tier === '基础' ? 10 : tier === '下位' ? 20 : 40,
      specializations: levels, basePower: base.power, baseManaCost: base.mana_cost, baseCooldown: base.cooldown_turns,
      baseChant: base.chant_turns, actualPower: Math.floor(actual.power), actualManaCost: actual.mana,
      actualCooldown: actual.cooldown, actualChant: actual.chant });
    const expected = skillSpecializationDetails({ ...base, learned: true, specializations: levels,
      specializationChoices: value.specializationChoices, specializationMaxLevel: value.specializationMaxLevel,
      specializationUpgradeCosts: {}, weaponMastery: false, passiveSpecializable: false,
      masteryProficiencyCost: null, masteryFocusCost: null });
    assert.deepEqual(specializationDisplayRows(value, []), expected);
  }
});

test('旧回复不会将已取整威力或蓝耗再乘倍率，缺失基础时明确显示下级规则', () => {
  const value = fixture({ actualPower: 107, actualManaCost: 2, specializations: { overcharge: 2 } });
  const [overcharge, potent, instant, efficient] = specializationDisplayRows(value, []);
  assert.equal(overcharge.currentEffect, '威力 107；蓝耗 2 MP。');
  assert.match(overcharge.nextEffect!, /威力基数×1\.06.*向下取整/);
  assert.doesNotMatch(overcharge.nextEffect!, /威力 113|蓝耗 3 MP/);
  assert.match(potent.nextEffect!, /普通效果×1\.06/);
  assert.match(instant.nextEffect!, /时间基数×0\.94/);
  assert.match(efficient.nextEffect!, /蓝耗基数×0\.88/);
});

test('动作报价提供方向等级、精确下级与费用，忽略其他技能报价', () => {
  const quoted = action({ quote: { action: 'specialization', skillId: 7, skillPointsBefore: 100,
    skillPointsAfter: 94, result: { level: 4, cost: 6, actualPower: 121, actualManaCost: 375 } } });
  const row = specializationDisplayRows(fixture({ specializationChoices: [] }), [action({ skillId: 99 }), quoted])[0];
  assert.equal(row.level, 3);
  assert.equal(row.cost, 6);
  assert.equal(row.nextEffect, '威力 121；蓝耗 375 MP。');
});

test('不能支付时仍显示按当前方向等级计算的费用，被动保留1SP例外', () => {
  const value = fixture({ specializations: { overcharge: 3, potent: 4, instant: 5, efficient: 6 }, level: 99 });
  assert.deepEqual(specializationDisplayRows(value, [action({ enabled: false, quote: undefined })]).map(row => row.cost), [3, 4, 5, 6]);
  const [passive] = specializationDisplayRows(fixture({ category: 'passive', passiveSpecializable: true, specializations: { potent: 3 } }), []);
  assert.equal(passive.cost, 1);
  assert.match(passive.currentEffect, /可成长数值 \+2\.8703%/);
  assert.doesNotMatch(passive.currentEffect, /1\.1236|12\.36%/);
});

test('武器娴熟使用实际被动属性，随心使用50%至100%规则与独立上限', () => {
  const value = fixture({ code: 'longsword_mastery', category: 'bound',
    specializations: { overcharge: 2, instant: 1 },
    passiveEffect: { weaponType: '长剑', critRatePct: 40, physicalAttackPct: 0, masteryStepPct: 10 } });
  const [proficiency, focus] = specializationDisplayRows(value, []);
  assert.equal(proficiency.currentEffect, '每把长剑：暴击+50%；副手按随心比例发挥。');
  assert.equal(proficiency.nextEffect, '每把长剑：暴击+60%；副手按随心比例发挥。');
  assert.doesNotMatch(proficiency.nextEffect!, /物攻/);
  assert.equal(proficiency.cost, 4);
  assert.match(focus.currentEffect, /发挥 50%/);
  assert.match(focus.nextEffect!, /发挥 60%/);
  assert.equal(focus.cost, 2);
  const unknown = specializationDisplayRows({ ...value, passiveEffect: undefined }, [])[0];
  assert.match(unknown.currentEffect, /娴熟 Lv\.2/);
  assert.doesNotMatch(unknown.currentEffect, /暴击\+|无声明的数值加成/);
  const numericStrings = specializationDisplayRows({ ...value,
    passiveEffect: { weaponType: '长剑', critRatePct: '40', masteryStepPct: '10' } }, [])[0];
  assert.equal(numericStrings.currentEffect, proficiency.currentEffect);
});

test('服务器已知当前效果保留；遗漏的下级只在等级一致时用已知数据补全', () => {
  const value = fixture({ specializations: { overcharge: 2 }, basePower: 101, baseManaCost: 300 });
  const known = specializationDisplayRows(value, [])[0];
  const row = { ...known, currentEffect: '服务器当前效果。', nextEffect: '' };
  const result = specializationDisplayRows({ ...value, specializationDetails: [row] }, [])[0];
  assert.equal(result.currentEffect, row.currentEffect);
  assert.equal(result.nextEffect, known.nextEffect);
  const differentLevel = { ...row, level: 3 };
  assert.strictEqual(specializationDisplayRows({ ...value, specializationDetails: [differentLevel] }, [])[0], differentLevel);
});

test('鉴识使用方向等级而非综合等级；范围与信息、费用分别增长', () => {
  const value = fixture({ code: 'appraisal', category: 'bound', level: 8, characterLevel: 12,
    appraisal: { rangeLevel: 2, informationLevel: 2 } });
  const [range, information] = specializationDisplayRows(value, []);
  assert.equal(range.currentEffect, '可鉴识高于自身 6 级以内的目标。');
  assert.equal(range.nextEffect, '可鉴识高于自身 9 级以内的目标。');
  assert.equal(range.cost, 2);
  assert.equal(information.cost, 3);
  assert.match(information.currentEffect, /名称、生命、魔力、技能；词条、详细属性/);
  assert.match(information.nextEffect!, /当前状态、目标仇恨、域民资料/);
  const quote = action({ action: 'appraisal', specialization: undefined, direction: 'range',
    quote: { action: 'appraisal', skillId: 7, skillPointsBefore: 100, skillPointsAfter: 98,
      result: { level: 9, rangeLevel: 3, informationLevel: 2, cost: 2 } } });
  assert.equal(specializationDisplayRows({ ...value, appraisal: null }, [quote])[0].level, 2);
});

test('满级显示当前但没有下级和费用；未学习、固定被动与无方向技能无条目', () => {
  for (const value of [
    fixture({ specializations: { overcharge: 10, potent: 10, instant: 10, efficient: 10 } }),
    fixture({ category: 'passive', passiveSpecializable: true, specializations: { potent: 10 } }),
    fixture({ code: 'staff_mastery', category: 'bound', specializations: { overcharge: 5, instant: 6 } }),
    fixture({ code: 'appraisal', category: 'bound', appraisal: { rangeLevel: 10, informationLevel: 4 } })
  ]) for (const row of specializationDisplayRows(value, [])) {
    assert.ok(row.currentEffect);
    assert.equal(row.nextEffect, null);
    assert.equal(row.cost, null);
  }
  assert.deepEqual(specializationDisplayRows(fixture({ learned: false }), []), []);
  assert.deepEqual(specializationDisplayRows(fixture({ category: 'passive', passiveSpecializable: false }), []), []);
  assert.deepEqual(specializationDisplayRows(fixture({ specializationChoices: [] }), []), []);
});

test('零蓝耗与魔力转赠不使用错误的固定倍率消耗', () => {
  const zero = specializationDisplayRows(fixture({ actualManaCost: 0 }), []);
  assert.ok(zero.every(row => row.currentEffect.includes('蓝耗 0 MP') && row.nextEffect!.includes('蓝耗 0 MP')));
  const transfer = specializationDisplayRows(fixture({ code: 'resident_d01', specializationChoices: ['instant'] }), [])[0];
  assert.match(transfer.currentEffect, /500 MP＋施法前当前 MP 的8%/);
  assert.match(transfer.nextEffect!, /500 MP＋施法前当前 MP 的8%/);
});
