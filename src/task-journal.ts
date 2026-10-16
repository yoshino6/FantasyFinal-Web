export type ManualMessageButton =
  | { label: string; actionId: string; revision: string; expiresAt?: string; command?: never }
  | { label: string; command: string; actionId?: never; revision?: never; expiresAt?: never };

export type JournalMessage = { text: string; markdown: string; images: string[]; buttons: ManualMessageButton[] };
export type JournalSection = { label: string; text: string };
export type JournalEntry = {
  id: string; title: string; kind: string; sections: JournalSection[];
  summary: string; images: string[]; buttons: ManualMessageButton[];
};
const categoryLabels = new Set(['主线', '支线', '委托', '悬赏', '其他', '副本']);
export const journalButtonLabel = (button: ManualMessageButton) => button.label.trim().replace(/^\[([^\]]+)\]$/, '$1');
export const journalButtonKey = (button: ManualMessageButton) => button.actionId !== undefined
  ? `action:${button.revision}:${button.actionId}` : `command:${button.command.trim()}`;
const uniqueButtons = (buttons: ManualMessageButton[]) => buttons.filter((button, index) => buttons.findIndex(other => journalButtonKey(other) === journalButtonKey(button)) === index);
const plain = (text: string) => text.replace(/^\s*> ?/gm, '').replace(/^#{1,6}\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const metadata = (line: string) => /^(?:#{1,6}\s*)?(?:【任务栏】|任务栏)\s*$/.test(line.trim())
  || /^分类：[\s\S]*$/.test(line.trim()) || /^当前第[（(]\d+\s*\/\s*\d+[）)]页\s*$/.test(line.trim());

function sections(text: string): JournalSection[] {
  const result: JournalSection[] = [];
  let description: string[] = [];
  const flush = () => {
    const text = description.join('\n').trim();
    if (text) result.push({ label: '', text });
    description = [];
  };
  for (const line of plain(text).split('\n')) {
    const fact = line.match(/^(目标|讨伐|报酬|奖励|进度|坐标|收集[^：:]*|提交[^：:]*|交付[^：:]*|所需[^：:]*|条件)[：:]\s*(.+)$/);
    if (fact) { flush(); result.push({ label: fact[1]!, text: fact[2]! }); }
    else description.push(line);
  }
  flush();
  return result;
}

/** Adapt the existing chat task page without changing or reconstructing issued actions. */
export function buildTaskJournal(messages: JournalMessage[]) {
  const entries: JournalEntry[] = [], extraButtons: ManualMessageButton[] = [], notices: string[] = [];
  let page = 1, totalPages = 1, pageKnown = false;
  let previous: ManualMessageButton | undefined, next: ManualMessageButton | undefined;
  for (const [messageIndex, message] of messages.entries()) {
    const rawSource = (message.markdown || message.text).replace(/\r\n?/g, '\n');
    const source = message.images.length ? rawSource.replace(/!\[[^\]]*\]\([^\n)]*\)/g, '') : rawSource;
    const pagination = source.match(/当前第[（(](\d+)\s*\/\s*(\d+)[）)]页/);
    if (pagination) { page = Number(pagination[1]); totalPages = Number(pagination[2]); pageKnown = true; }
    const taskButtons = uniqueButtons(message.buttons.filter(button => {
      const label = journalButtonLabel(button);
      if (categoryLabels.has(label) || /^\/任务分类\s/.test(button.command ?? '')) return false;
      if (label === '上一页') { previous ??= button; return false; }
      if (label === '下一页') { next ??= button; return false; }
      // Chat search buttons only prefill a command; the journal provides its own page filter.
      if (label === '搜索' && typeof button.command === 'string' && /^\/任务搜索\s*$/.test(button.command)) return false;
      return true;
    }));
    const used = new Set<ManualMessageButton>();
    const matchingButton = (label: string) => taskButtons.find(button => !used.has(button) && button.label.trim() === label);
    const labels = [...new Set(taskButtons.map(button => button.label.trim()))].sort((a, b) => b.length - a.length);
    const readActionLine = (line: string): { buttons: ManualMessageButton[]; rest: string } => {
      let rest = line.trim();
      const buttons: ManualMessageButton[] = [];
      while (rest) {
        const label = labels.find(label => rest.startsWith(label));
        if (!label) break;
        const button = taskButtons.find(button => !used.has(button) && !buttons.includes(button) && button.label.trim() === label);
        if (button && !buttons.includes(button)) buttons.push(button);
        rest = rest.slice(label.length).trim();
      }
      return { buttons, rest };
    };
    const headers = [...source.matchAll(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*【[^】]+】[^\n]*/gm)];
    const blocks: string[] = [];
    if (headers.length) {
      const prelude = source.slice(0, headers[0]!.index).split('\n').filter(line => !metadata(line)).join('\n').trim();
      if (prelude) blocks.push(prelude);
      headers.forEach((header, index) => blocks.push(source.slice(header.index, headers[index + 1]?.index ?? source.length)));
    } else blocks.push(source);
    for (const [blockIndex, raw] of blocks.entries()) {
      const lines = raw.split('\n').filter(line => !metadata(line));
      while (!lines[0]?.trim() && lines.length) lines.shift();
      if (!lines.length) continue;
      const heading = lines[0]!.match(/^(?:[①②③④⑤⑥⑦⑧⑨⑩]\s*)?【([^】]+)】(.*)$/);
      let title = '', kind = '';
      const buttons: ManualMessageButton[] = [];
      if (heading) {
        lines.shift();
        // Inline abandonment belongs to the title row; quoted narrative is never matched.
        let suffix = heading[2]!.trim();
        const titleActions = suffix.match(/(?:\s*\[[^\]]+\])+\s*$/)?.[0];
        if (titleActions) {
          const parsed = readActionLine(titleActions);
          if (!parsed.rest) { buttons.push(...parsed.buttons); suffix = suffix.slice(0, -titleActions.length).trim(); }
        }
        const parts = heading[1]!.split('·');
        kind = suffix ? heading[1]! : parts.length > 1 ? parts[0]! : '';
        title = suffix || (parts.length > 1 ? parts.slice(1).join('·') : heading[1]!);
        buttons.forEach(button => used.add(button));
      }
      const body: string[] = [];
      for (const line of lines) {
        const coordinate = line.match(/^\s*>\s*坐标：[ \t]*(.+)\s*$/);
        if (coordinate) {
          const button = matchingButton(coordinate[1]!.trim());
          if (button) { buttons.push(button); used.add(button); }
          body.push(line);
        } else if (line.trim() && !/^\s*>/.test(line)) {
          const parsed = readActionLine(line);
          if (!parsed.rest && parsed.buttons.length) {
            buttons.push(...parsed.buttons); parsed.buttons.forEach(button => used.add(button));
          } else body.push(line);
        } else body.push(line);
      }
      let bodyText = plain(body.join('\n'));
      if (!heading && !headers.length && /^当前没有|^没有找到/.test(bodyText) && !taskButtons.length && !message.images.length) {
        notices.push(bodyText); continue;
      }
      if (!heading) {
        const first = bodyText.split('\n')[0] || '任务提示';
        title = first.length <= 50 ? first : '任务提示';
        if (title === first) bodyText = bodyText.slice(first.length).trim();
      }
      // Plain/older responses with one message per task have no inline action markers.
      if (!headers.length && blocks.length === 1) {
        for (const button of taskButtons) if (!used.has(button)) { buttons.push(button); used.add(button); }
      }
      const detail = sections(bodyText);
      entries.push({ id: `${messageIndex}:${blockIndex}:${title}`, title, kind, sections: detail,
        summary: detail[0] ? `${detail[0].label ? `${detail[0].label}：` : ''}${detail[0].text}` : '查看任务详情',
        images: blockIndex === 0 ? message.images : [], buttons: uniqueButtons(buttons) });
    }
    extraButtons.push(...taskButtons.filter(button => !used.has(button)));
  }
  return { entries, extraButtons: uniqueButtons(extraButtons), notices, page, totalPages, pageKnown, previous, next };
}
