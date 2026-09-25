// import 形态不变量见 channels.ts 头注释（相对 import 省略扩展名；迁移 ESM 前须回补）。
import type { CancellationToken, Event } from "./foundation";

export interface IChannel {
  call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T>;
  listen<T>(event: string, arg?: any): Event<T>;
}

export interface IServerChannel<TContext = string> {
  call<T>(
    ctx: TContext,
    command: string,
    arg?: any,
    cancellationToken?: CancellationToken,
  ): Promise<T>;
  listen<T>(ctx: TContext, event: string, arg?: any): Event<T>;
}

export const enum RequestType {
  Promise = 100,
  PromiseCancel = 101,
  EventListen = 102,
  EventDispose = 103,
}

export const enum ResponseType {
  Initialize = 200,
  PromiseSuccess = 201,
  PromiseError = 202,
  PromiseErrorObj = 203,
  EventFire = 204,
}

export type IRawResponse =
  | { type: ResponseType.Initialize }
  | { type: ResponseType.PromiseSuccess; id: number; data: any }
  | {
      type: ResponseType.PromiseError;
      id: number;
      data: {
        message: string;
        name: string;
        stack: string[] | undefined;
        code?: unknown;
        kind?: unknown;
        status?: unknown;
        retryAfterMs?: unknown;
        data?: unknown;
        detail?: unknown;
        details?: unknown;
        taskId?: unknown;
        traceId?: unknown;
      };
    }
  | { type: ResponseType.PromiseErrorObj; id: number; data: any }
  | { type: ResponseType.EventFire; id: number; data: any };

export type IHandler = (response: IRawResponse) => void;

export interface IChannelServer<TContext = string> {
  registerChannel(channelName: string, channel: IServerChannel<TContext>): void;
  ready?(): void;
}

export interface IChannelClient {
  getChannel<T extends IChannel>(channelName: string): T;
}
