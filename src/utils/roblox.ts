import colors from "picocolors";

export interface RobloxUserInfo {
  userId?: number;
  userName?: string;
}

interface AuthenticatedUserResponse {
  id?: number;
  name?: string;
  displayName?: string;
}

interface RobloxPresenceResponse {
  userPresences: Array<{
    userPresenceType: number;
    lastLocation: string;
    placeId?: number;
    rootPlaceId?: number;
    gameId?: string;
    universeId?: number;
    userId: number;
    lastOnline: string;
  }>;
}

interface RobloxUserSearchResponse {
  data: Array<{
    id: number;
    name: string;
    displayName: string;
  }>;
}

export async function validateRobloxCookie(
  cookie: string
): Promise<{ isValid: boolean; userInfo?: RobloxUserInfo; error?: string }> {
  try {
    cookie = cookie.trim().replace(/[\r\n\t]/g, "");

    const response = await fetch(
      "https://users.roblox.com/v1/users/authenticated",
      {
        headers: {
          Cookie: `.ROBLOSECURITY=${cookie}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      }
    );

    if (!response.ok) {
      return { isValid: false, error: `HTTP ${response.status}` };
    }

    const authenticatedUser =
      (await response.json()) as AuthenticatedUserResponse;

    if (authenticatedUser.id && authenticatedUser.name) {
      const userInfo: RobloxUserInfo = {
        userId: authenticatedUser.id,
        userName: authenticatedUser.name,
      };

      return { isValid: true, userInfo };
    } else {
      return { isValid: false, error: "Invalid response format" };
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function checkRobloxPresenceById(
  userId: number
): Promise<boolean> {
  try {
    const presenceResponse = await fetch(
      `https://presence.roblox.com/v1/presence/users`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [userId] }),
      }
    );

    if (!presenceResponse.ok) return false;

    const presenceData =
      (await presenceResponse.json()) as RobloxPresenceResponse;
    if (
      !presenceData.userPresences ||
      presenceData.userPresences.length === 0
    ) {
      return false;
    }

    const presence = presenceData.userPresences[0];
    if (!presence) return false;

    return presence.userPresenceType === 2; // 2 = In Game
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      colors.gray(
        `    [!] Presence check failed for user ${userId}: ${errorMessage}`
      )
    );
    return false;
  }
}

export async function searchRobloxUserByUsername(
  username: string
): Promise<{ id: number; name: string; displayName: string } | null> {
  try {
    const userResponse = await fetch(
      `https://users.roblox.com/v1/users/search?keyword=${username}&limit=10`
    );

    if (!userResponse.ok) return null;

    const userData = (await userResponse.json()) as RobloxUserSearchResponse;
    if (!userData.data || userData.data.length === 0) return null;

    const exactUser = userData.data.find(
      (user) => user.name.toLowerCase() === username.toLowerCase()
    );

    return exactUser || null;
  } catch (error) {
    console.log(
      colors.gray(
        `    [!] User search failed for ${username}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    return null;
  }
}
