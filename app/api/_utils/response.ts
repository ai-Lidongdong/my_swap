import { NextResponse } from 'next/server';

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: string;
}

function serializeBigInt(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_, currentValue) =>
      typeof currentValue === 'bigint' ? currentValue.toString() : currentValue,
    ),
  );
}

export function apiOk<T>(data: T, message = 'ok', status = 200) {
  return NextResponse.json<ApiSuccessResponse<T>>(
    {
      success: true,
      message,
      data: serializeBigInt(data) as T,
    },
    { status },
  );
}

export function apiError(error: unknown, message = '请求失败', status = 500) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return NextResponse.json<ApiErrorResponse>(
    {
      success: false,
      message,
      error: errorMessage,
    },
    { status },
  );
}

export async function withApiHandler<T>(
  handler: () => Promise<T>,
  options?: {
    successMessage?: string;
    errorMessage?: string;
    successStatus?: number;
    errorStatus?: number;
  },
) {
  try {
    const data = await handler();
    return apiOk(
      data,
      options?.successMessage ?? 'ok',
      options?.successStatus ?? 200,
    );
  } catch (error) {
    return apiError(
      error,
      options?.errorMessage ?? '请求失败',
      options?.errorStatus ?? 500,
    );
  }
}
