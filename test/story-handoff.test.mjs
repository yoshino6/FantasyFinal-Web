import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('completed story and task navigation release the modal and select the actual web panel', () => {
  const vue = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
  const script = vue.slice(vue.indexOf('>') + 1, vue.indexOf('</script>'));
  const file = ts.createSourceFile('App.ts', script, ts.ScriptTarget.Latest, true);
  const names = ['commandMessages', 'storyGuideFrom', 'showStoryResult', 'leaveStory', 'presentCommandResult'];
  const statements = file.statements.filter(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => names.includes(d.name.getText(file))));
  assert.equal(statements.length, names.length);
  const code = ts.transpileModule(statements.map(s => s.getText(file)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const refs = Object.fromEntries(['panel','storyGuide','storyError','dismissedStoryRevision','interactionOpen','catalogOpen','tab','manualOpen','handbookOpen','characterSection','advancedProfessionOpen','interactionMessages','manualMessages'].map(key => [key, { value: null }]));
  refs.panel.value = { account: { hasCharacter: true } };
  const service = new Function(...Object.keys(refs), `${code}\nreturn { presentCommandResult, leaveStory };`)(...Object.values(refs));
  const present = service.presentCommandResult;
  present({ presentation: 'story', text: '初章', buttons: [{ label: '继续' }] }, 'story');
  assert.equal(refs.tab.value, 'explore'); assert.ok(refs.storyGuide.value);
  for (const destination of ['explore','character','inventory','evolution','advancedProfession']) {
    present({ presentation: 'page', destination, text: '', buttons: [{ label: '面板' }] }, 'manual');
    assert.equal(refs.storyGuide.value, null); assert.equal(refs.manualOpen.value, false);
    assert.equal(refs.tab.value, ['evolution','advancedProfession'].includes(destination) ? 'character' : destination);
    if (destination === 'evolution') assert.equal(refs.characterSection.value, 'evolution');
  }
  assert.equal(refs.characterSection.value, 'advancedProfession');
  present({ presentation: 'interaction', text: '公会', buttons: [{ label: '登记' }] }, 'story');
  assert.equal(refs.storyGuide.value, null); assert.equal(refs.interactionOpen.value, true);
  refs.panel.value.pendingStory = { revision: 'opening:1' };
  present({ presentation: 'interaction', text: '待续剧情' }, 'story'); assert.ok(refs.storyGuide.value);
  service.leaveStory(); assert.equal(refs.dismissedStoryRevision.value, 'opening:1');
  assert.ok(vue.includes(':can-finish="Boolean(panel?.account?.hasCharacter && !panel?.pendingStory)"'));
});
