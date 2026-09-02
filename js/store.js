export const state = {
  session: null,
  profile: null,
  couple: null,
  partner: null,
  members: [],
  workspaces: [],
  invites: [],
  categories: [],
  categoryLimits: [],
  transactions: [],
  personalTransactions: [],
  goals: [],
  bills: [],
  events: [],
  notifications: [],
  activeTab: "dashboardTab"
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
    categoryLimits: [],
    transactions: [],
    personalTransactions: [],
    goals: [],
    bills: [],
    events: [],
    notifications: [],
    activeTab: "dashboardTab"
  });
}
