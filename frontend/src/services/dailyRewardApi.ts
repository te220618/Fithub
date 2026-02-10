import api from './api';

export interface DailyRewardDay {
  day: number;
  claimed: boolean;
  claimedDate: string | null;
  exp: number;
  isBigReward: boolean;
}

export interface DailyRewardsResponse {
  currentDay: number;
  todayClaimed: boolean;
  days: DailyRewardDay[];
}

export interface ClaimRewardResponse {
  success: boolean;
  alreadyClaimed: boolean;
  rewardDay: number;
  expEarned: number;
  totalExp: number;
}

const dailyRewardApi = {
  /**
   * Get the 14-day reward status
   */
  getRewards: async (): Promise<DailyRewardsResponse> => {
    const response = await api.get('/api/daily-rewards');
    return response.data;
  },

  /**
   * Claim today's reward
   */
  claimReward: async (): Promise<ClaimRewardResponse> => {
    const response = await api.post('/api/daily-rewards/claim');
    return response.data;
  },
};

export default dailyRewardApi;
