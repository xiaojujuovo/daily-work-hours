export const MIN_REFRESH_SECONDS=.01;
export const MAX_REFRESH_SECONDS=3;

export function parseRefreshInterval(text) {
 const value=String(text).trim();
 const message='请输入 0.01–3 秒，最多四位小数。';
 if(!/^(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/.test(value))throw new Error(message);
 const micros=Math.round(Number(value)*1_000_000);
 if(micros<MIN_REFRESH_SECONDS*1_000_000||micros>MAX_REFRESH_SECONDS*1_000_000)throw new Error(message);
 return micros;
}
