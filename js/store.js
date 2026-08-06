export const state = {
  session: null,
  profile: null,
  couple: null,
  partner: null,
  members: [],
  workspaces: [],
  invites: [],
  categories: [],
  transactions: [],
  goals: [],
  bills: [],
  events: [],
  notifications: [],
  activeTab: "dashboardTab",
  generatedInviteCode: null
};

export function patchState(patch) {
  Object.assign(state, patch);
}

export function clearState() {
  patchState({
    session: null,
    profile: null,
    couple: null,
    partner: null,
    members: [],
    workspaces: [],
    invites: [],
    categories: [],
    transactions: [],
    goals: [],
    bills: [],
    events: [],
    notifications: [],
    activeTab: "dashboardTab"
  });
}
