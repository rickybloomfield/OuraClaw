import https from 'node:https';

import { OURA_API_BASE } from './config';
import { OuraApiResponse, OuraEndpoint } from './types';

export function buildCollectionUrl(
  endpoint: OuraEndpoint,
  startDate?: string,
  endDate?: string
): string {
  const params = new URLSearchParams();
  if (startDate) {
    params.set('start_date', startDate);
  }
  if (endDate) {
    params.set('end_date', endDate);
  }

  const suffix = params.toString();
  return `${OURA_API_BASE}/${endpoint}${suffix ? `?${suffix}` : ''}`;
}

export async function fetchOuraData<T>(
  accessToken: string,
  endpoint: OuraEndpoint,
  startDate?: string,
  endDate?: string
): Promise<OuraApiResponse<T>> {
  const url = buildCollectionUrl(endpoint, startDate, endDate);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as OuraApiResponse<T>);
            } catch {
              reject(new Error(`Failed to parse Oura API response: ${data}`));
            }
            return;
          }

          reject(new Error(`Oura API error (${res.statusCode ?? 'unknown'}): ${data}`));
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}
