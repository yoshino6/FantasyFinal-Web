import { ref } from 'vue';
import * as api from './api';

type Session = { generation: number; token: string };
type PlayerTarget = { gameId?: number | string; messageId?: number; channelId?: string };
type Dependencies = {
  session: () => Session;
  isCurrentSession: (session: Session) => boolean;
  socialChanged: () => Promise<unknown>;
  partyChanged: () => Promise<unknown>;
  whisper: (gameId: number, isCurrent: () => boolean) => Promise<void>;
};

/** Keep reads and action results attached to the selected player and signed-in account. */
export function usePlayerCard(dependencies: Dependencies) {
  const open = ref(false), loading = ref(false), busy = ref(false);
  const profile = ref<api.PlayerCardProfile | null>(null);
  const error = ref(''), notice = ref('');
  const invitationsOpen = ref(false), invitationsLoading = ref(false);
  const invitations = ref<api.PartyInvitation[]>([]);
  const invitationsError = ref(''), invitationsNotice = ref('');
  let selectedGameId: number | undefined;
  let selectedTarget: PlayerTarget | undefined;
  let profileVersion = 0, invitationsVersion = 0, actionVersion = 0;
  const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  const publicGameId = (value: unknown): number | undefined => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) return undefined;
    const id = Number(value);
    return validId(id) ? id : undefined;
  };

  function closeProfile() { open.value = false; profileVersion += 1; loading.value = false; }
  function closeInvitations() { invitationsOpen.value = false; invitationsVersion += 1; invitationsLoading.value = false; }
  function closeAll() { closeProfile(); closeInvitations(); }
  function reset() {
    closeAll(); actionVersion += 1; busy.value = false; selectedGameId = undefined; selectedTarget = undefined;
    profile.value = null; invitations.value = []; error.value = ''; notice.value = '';
    invitationsError.value = ''; invitationsNotice.value = '';
  }

  async function reloadProfile() {
    const session = dependencies.session(), version = ++profileVersion, target = selectedTarget;
    if (!session.token || !open.value) return;
    const isCurrent = () => dependencies.isCurrentSession(session) && version === profileVersion && open.value;
    let gameId = selectedGameId;
    loading.value = true; error.value = '';
    try {
      // Old in-memory messages can predate the public identity fields. Resolve their
      // exact author through the existing authenticated channel history endpoint.
      if (!validId(gameId) && target?.channelId && validId(target.messageId) && target.messageId < Number.MAX_SAFE_INTEGER) {
        const page = await api.messages(target.channelId, target.messageId + 1, 1);
        if (!isCurrent()) return;
        const message = page.messages.find(item => Number(item.id) === target.messageId);
        gameId = publicGameId(message?.recruitment?.leaderGameId ?? message?.senderGameId);
      }
      if (!validId(gameId)) throw new Error('这条消息缺少玩家游戏 ID，请刷新频道后重试。');
      selectedGameId = gameId;
      const result = await api.playerCard(gameId);
      if (isCurrent()) profile.value = result;
    } catch (cause) {
      if (isCurrent()) error.value = api.userFacingErrorMessage(cause);
    } finally {
      if (dependencies.isCurrentSession(session) && version === profileVersion) loading.value = false;
    }
  }

  async function inspect(target: PlayerTarget) {
    closeInvitations(); closeProfile(); profile.value = null; error.value = ''; notice.value = '';
    selectedTarget = { ...target }; selectedGameId = publicGameId(target.gameId); open.value = true;
    await reloadProfile();
  }

  async function refreshInvitations(silent = false) {
    const session = dependencies.session();
    if (!session.token || invitationsLoading.value || busy.value) return;
    const version = ++invitationsVersion;
    invitationsLoading.value = true;
    if (!silent) invitationsError.value = '';
    try {
      const result = await api.playerPartyInvitations();
      if (dependencies.isCurrentSession(session) && version === invitationsVersion) invitations.value = result.items;
    } catch (cause) {
      if (dependencies.isCurrentSession(session) && version === invitationsVersion && invitationsOpen.value) invitationsError.value = api.userFacingErrorMessage(cause);
    } finally {
      if (dependencies.isCurrentSession(session) && version === invitationsVersion) invitationsLoading.value = false;
    }
  }

  async function showInvitations() {
    closeProfile(); invitationsOpen.value = true; invitationsError.value = ''; invitationsNotice.value = '';
    await refreshInvitations();
  }

  async function profileAction(action: () => Promise<{ message: string }>, refreshParty = false) {
    const session = dependencies.session(), playerId = selectedGameId, version = profileVersion;
    if (!session.token || busy.value || loading.value || !profile.value || !open.value) return;
    const actionId = ++actionVersion;
    busy.value = true; error.value = ''; notice.value = '';
    try {
      const result = await action();
      if (!dependencies.isCurrentSession(session) || actionId !== actionVersion) return;
      await dependencies.socialChanged();
      if (refreshParty && dependencies.isCurrentSession(session)) await dependencies.partyChanged();
      if (dependencies.isCurrentSession(session) && version === profileVersion && open.value && playerId === selectedGameId) {
        notice.value = result.message;
        await reloadProfile();
      }
    } catch (cause) {
      if (dependencies.isCurrentSession(session) && version === profileVersion && open.value) error.value = api.userFacingErrorMessage(cause);
    } finally {
      if (actionId === actionVersion) busy.value = false;
    }
  }

  async function addFriend() {
    const player = profile.value;
    if (!player || player.viewer.isSelf || player.viewer.isFriend || player.viewer.friendRequestStatus === 'outgoing') return;
    if (player.viewer.friendRequestStatus === 'incoming') {
      if (validId(player.viewer.incomingFriendRequestId)) await profileAction(() => api.acceptPlayerFriendRequest(player.viewer.incomingFriendRequestId!));
    } else await profileAction(() => api.requestPlayerFriend(player.gameId));
  }

  async function inviteParty() {
    const player = profile.value;
    if (!player || !player.viewer.canInviteParty || player.viewer.isSelf || player.viewer.sameParty || player.viewer.partyInvitationStatus === 'outgoing') return;
    await profileAction(() => api.invitePlayerToParty(player.gameId), true);
  }

  async function respondInvitation(response: { id: number; action: 'accept' | 'reject' }) {
    const session = dependencies.session();
    if (!session.token || busy.value || !validId(response.id) || !invitations.value.some(item => item.id === response.id) || !['accept', 'reject'].includes(response.action)) return;
    const actionId = ++actionVersion;
    invitationsVersion += 1; invitationsLoading.value = false;
    busy.value = true; invitationsError.value = ''; invitationsNotice.value = '';
    try {
      const result = await api.respondPlayerPartyInvitation(response.id, response.action);
      if (!dependencies.isCurrentSession(session) || actionId !== actionVersion) return;
      invitations.value = invitations.value.filter(item => item.id !== response.id);
      invitationsNotice.value = result.message;
      if (response.action === 'accept') await dependencies.partyChanged();
      if (dependencies.isCurrentSession(session)) await dependencies.socialChanged();
    } catch (cause) {
      if (dependencies.isCurrentSession(session) && invitationsOpen.value) invitationsError.value = api.userFacingErrorMessage(cause);
    } finally {
      if (actionId === actionVersion) {
        busy.value = false;
        if (dependencies.isCurrentSession(session)) await refreshInvitations(true);
      }
    }
  }

  async function whisper() {
    const player = profile.value, session = dependencies.session(), version = profileVersion;
    if (!session.token || !open.value || !player || busy.value || loading.value || !player.viewer.isFriend || player.viewer.isSelf) return;
    const actionId = ++actionVersion;
    const isCurrent = () => dependencies.isCurrentSession(session) && actionId === actionVersion && version === profileVersion && open.value;
    busy.value = true; error.value = '';
    try {
      await dependencies.whisper(player.gameId, isCurrent);
      if (isCurrent()) closeProfile();
    } catch (cause) {
      if (isCurrent()) error.value = api.userFacingErrorMessage(cause);
    } finally {
      if (actionId === actionVersion) busy.value = false;
    }
  }

  return { open, loading, busy, profile, error, notice, invitationsOpen, invitationsLoading, invitations, invitationsError, invitationsNotice,
    inspect, reloadProfile, closeProfile, closeInvitations, closeAll, reset, refreshInvitations, showInvitations, addFriend, inviteParty, respondInvitation, whisper };
}
