import type { TranslationKey } from './labels';

/** Stages a contact message moves through. `stage` in the database is one of these words. */
export const MESSAGE_STAGES = ['new', 'read', 'replied', 'archived'] as const;
export type MessageStage = (typeof MESSAGE_STAGES)[number];

export const MESSAGE_STAGE_LABELS: Record<MessageStage, TranslationKey> = {
  new: 'messages.tab.new',
  read: 'messages.tab.read',
  replied: 'messages.tab.replied',
  archived: 'messages.tab.archived',
};

export function isMessageStage(value: string): value is MessageStage {
  return (MESSAGE_STAGES as readonly string[]).includes(value);
}

/** Buttons say what they do to the message, so a stage name never appears where an action belongs. */
export const MESSAGE_STAGE_ACTIONS: Record<MessageStage, TranslationKey> = {
  new: 'messages.markNew',
  read: 'messages.markRead',
  replied: 'messages.markReplied',
  archived: 'messages.markArchived',
};

/** One message in a table reads «Прочитано», the tab that collects them reads «Прочитанные». */
export const MESSAGE_STAGE_STATUSES: Record<MessageStage, TranslationKey> = {
  new: 'messages.stage.new',
  read: 'messages.stage.read',
  replied: 'messages.stage.replied',
  archived: 'messages.stage.archived',
};

/** Query string for the list page, so a filter survives marking a message. */
export function messagesQuery(stage: MessageStage, q: string, page: number): string {
  const params = new URLSearchParams();
  if (stage !== 'new') params.set('stage', stage);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}
