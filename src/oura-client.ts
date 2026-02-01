import https from "https";
import { OuraApiResponse, OuraEndpoint } from "./types";

const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";

export async function fetchOuraData<T>(
  accessToken: string,
  endpoint: OuraEndpoint,
  startDate?: string,
  endDate?: string,
): Promise<OuraApiResponse<T>> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);

  const url = `${OURA_API_BASE}/${endpoint}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse Oura API response: ${data}`));
            }
          } else {
            reject(
              new Error(
                `Oura API error (${res.statusCode}): ${data}`,
              ),
            );
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}
