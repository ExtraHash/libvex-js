import { EventEmitter } from "events";
import WebSocket from "isomorphic-ws";
import { decodeUTF8 } from "tweetnacl-util";
import { v4 as uuidv4 } from "uuid";
import { KeyRing } from "./Keyring";
import { Utils } from "./Utils";

/**
 * @ignore
 */
interface ITrxSub {
  // tslint:disable-next-line: ban-types
  callback: Function;
  id: string;
}

export interface IClient {
  index: number;
  pubkey: string;
  username: string;
  powerLevel: number;
  userID: string;
  banned: boolean;
}

export interface IChannel {
  index: number;
  channelID: string;
  admin: string;
  public: boolean;
  name: string;
}

export interface IChallenge {
  type: string;
  transmissionID: string;
  messageID?: string;
  challenge: string;
  pubkey: string;
}

export interface IResponse {
  type: string;
  transmissionID: string;
  messageID?: string;
  response: string;
  pubkey: string;
}

export interface IApiSuccess {
  type: "success";
  transmissionID: string;
  messageID: string;
  data: any;
}

export interface IApiError {
  type: "error";
  transmissionID: string;
  messageID: string;
  Code: string;
  Message: string;
  Error: Error | null;
}

export interface IApiPong {
  type: "pong";
  messageID: string;
  transmissionID: string;
}

export interface IChatMessage {
  type: "chat";
  index: number;
  username: string;
  messageID: string;
  transmissionID: string;
  method: string;
  message: string;
  channelID: string;
}

export interface IPermission {
  userID: string;
  channelID: string;
  powerLevel: number;
}

export interface IClientInfo {
  authed: boolean;
  client: IClient | null;
  host: string;
  secure: boolean;
}

interface IMessages {
  /**
   * Retrieves history since a last known message. If no last message is supplied,
   * all history will be retrieved.
   * @param channelID - The channel's unique id.
   * @param lastKnownMessageID - The unique ID of the last known message.
   *
   * @returns - An array of the messages since the known message.
   */

  retrieve: (
    channelID: string,
    lastKnownMessageID?: string
  ) => Promise<IChatMessage[]>;
  /**
   * Sends a message to a channel.
   * @param channelID - The channel's unique id.
   * @param data - The message to send.
   */
  send: (channelID: string, data: string) => void;
}

interface IChannels {
  /**
   * Retrieves the channels in the server that you have permission to.
   *
   * @returns - An array of Channel objects.
   */
  retrieve: () => Promise<IChannel[]>;
  /**
   * Creates a new channel on the server.
   * @param name - The name of the channel.
   * @param privateChannel - Whether or not the channel is private.
   *
   * @returns - The created Channel object.
   */
  create: (name: string, privateChannel: boolean) => Promise<IChannel>;
  /**
   * Joins a channel on the server.
   * @param channelID - The channel unique id.
   *
   * @returns - The joined Channel object.
   */
  join: (channelID: string) => Promise<IChannel>;
  /**
   * Leaves a channel on the server you have previously joined.
   * @param channelID - The channel unique id.
   *
   * @returns - The left Channel object.
   */
  leave: (channelID: string) => Promise<IChannel>;
  /**
   * Deletes a channel on the server.
   * @param channelID - The channel unique id.
   *
   * @returns - The deleted Channel object.
   */
  delete: (channelID: string) => Promise<IChannel>;
}

interface IUsers {
  /**
   * Updates a user's power level.
   * @param userID - The user's unique id.
   * @param powerLevel - The power level to set.
   *
   * @returns - The modified Client object.
   */
  update: (userID: string, powerLevel: number) => Promise<IClient>;
  /**
   * Disconnects a user temporarily from the server.
   * @param userID - The user's unique id.
   *
   * @returns - The kicked Client object.
   */
  kick: (userID: string) => Promise<IClient>;
  /**
   * Bans a user's public key permanently from the server.
   * @param userID - The user's unique id.
   *
   * @returns - The banned Client object.
   */
  ban: (userID: string) => Promise<IClient>;
}

interface IPermissions {
  /**
   * Creates a new permission for a user for a private channel.
   * @param userID - The user's unique id.
   * @param channelID - The channel's unique id.
   *
   * @returns - The created Permission object.
   */

  create: (userID: string, channelID: string) => Promise<IPermission>;
  /**
   * Revokes a permission for a user for a private channel.
   * @param userID - The user's unique id.
   * @param channelID - The channel's unique id.
   *
   * @returns - The deleted Permission object.
   */

  delete: (userID: string, channelID: string) => Promise<IPermission>;
}

// tslint:disable-next-line: interface-name
export declare interface Client {
  /**
   * This is emitted whenever the keyring is done initializing. You must wait
   * to perform any operaitons until this event.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("ready", (error) => {
   *     await client.register()
   *   });
   * ```
   *
   * @event
   */
  on(event: "ready", callback: () => void): this;

  /**
   * This is emitted whenever the client experiences an error initializing.
   *
   * Example:
   *
   * ```ts
   *
   *   client.on("error", (error) => {
   *     // do something with the error
   *   });
   * ```
   *
   * @event
   */
  on(event: "error", callback: (error: Error) => void): this;

  /**
   * Messages are emitted through this event. You must join a channel
   * to get messages.
   *
   * ```ts
   *
   *   client.on("message", (message) => {
   *     console.log(message)
   *   });
   * ```
   *
   * @event
   */
  on(event: "message", callback: (message: IChatMessage) => void): this;
}

/**
 * The Client provides an interface that allows you to interface with
 * a vex chat server.
 *
 * Example Usage:
 *
 * ```ts
 *   import { v4 as uuidv4 } from "uuid";
 *   import { Client, IChatMessage } from "../src/Client";
 *   import { KeyRing } from "../src/Keyring";
 *   import { Utils } from "../src/Utils";
 *
 *   const keyring = new KeyRing("./keys");
 *
 *   keyring.on("ready", () => {
 *    console.log("PUBLIC KEY", Utils.toHexString(keyring.getPub()));
 *    // make sure you save your private key somewhere
 *    console.log("PRIVATE KEY", Utils.toHexString(keyring.getPriv()));
 *   });
 *
 *   const vexClient = new Client(
 *     "localhost:8000",
 *     keyring,
 *     null,
 *     false
 *   );
 *
 *   const testID = uuidv4();
 *   console.log("TEST ID", testID);
 *
 *   vexClient.on("ready", async () => {
 *     const account = await vexClient.register()
 *
 *     // save the account info here, you need it to log in.
 *     console.log(account);
 *
 *     const serverPubkey = await vexClient.auth();
 *     console.log("SERVER PUBKEY", serverPubkey);
 *
 *
 *     // then log in with the account
 *     await vexClient.auth();
 *   });
 *
 *   vexClient.on("message", async (message: IChatMessage) => {
 *     console.log(message);
 *   });
 *
 *   vexClient.on("error", (error: any) => {
 *     console.log(error);
 *   });
 *
 * ```
 *
 * Note that the sign() and verify() functions take uint8 arrays.
 * If you need to convert hex strings into Uint8 arrays, use the
 * helper functions in the Utils class.
 *
 * @noInheritDoc
 */
export class Client extends EventEmitter {
  public channels: IChannels;
  public permissions: IPermissions;
  public messages: IMessages;
  public users: IUsers;
  private authed: boolean;
  private channelList: IChannel[];
  private clientInfo: IClient | null;
  private ws: WebSocket | null;
  private host: string;
  private trxSubs: ITrxSub[];
  private serverAlive: boolean;
  private keyring: KeyRing;
  private pingInterval: NodeJS.Timeout | null;
  private secure: boolean;
  private wsPrefix: string;
  private httpPrefix: string;
  private reconnecting: boolean;
  private connectedChannelList: string[];
  private history: IChatMessage[];
  private serverPubkey: string | null;

  /**
   * @param host - The hostname:port of the server.
   * @param keyring - The keyring object to use to login.
   * @param serverPubKey - The server pubkey, if already known. If not, use null and save it after first login.
   * @param secure - Whether or not to use SSL. You should only disable SSL for development.
   */
  constructor(
    host: string,
    keyring: KeyRing,
    serverPubkey: string | null,
    secure: boolean = true
  ) {
    super();
    this.secure = secure;
    this.keyring = keyring;
    this.clientInfo = null;
    this.ws = null;
    this.host = host;
    this.trxSubs = [];
    this.serverAlive = true;
    this.authed = false;
    this.reconnecting = false;
    this.history = [];
    this.channelList = [];
    this.serverPubkey = serverPubkey;
    this.connectedChannelList = [];
    this.pingInterval = null;

    this.channels = {
      create: this.createChannel.bind(this),
      delete: this.deleteChannel.bind(this),
      join: this.joinChannel.bind(this),
      leave: this.leaveChannel.bind(this),
      retrieve: this.getChannelList.bind(this),
    };

    this.permissions = {
      create: this.grantChannel.bind(this),
      delete: this.revokeChannel.bind(this),
    };

    this.messages = {
      retrieve: this.getHistory.bind(this),
      send: this.sendMessage.bind(this),
    };

    this.users = {
      ban: this.banUser.bind(this),
      kick: this.kickUser.bind(this),
      update: this.opUser.bind(this),
    };

    if (!this.secure) {
      console.warn(
        "Warning! Insecure connections are dangerous. You should only use them for development."
      );
      this.wsPrefix = "ws://";
      this.httpPrefix = "http://";
    } else {
      this.wsPrefix = "wss://";
      this.httpPrefix = "https://";
    }

    this.init();
  }

  /**
   * Logs out of the server.
   */
  public logout() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.ws?.close();
  }

  /**
   * Registers a new account on the server.
   *
   * @returns The new account object.
   */
  public async register(): Promise<IClient> {
    const userAccount: IClient = await this.newUser();
    await this.registerUser(userAccount);
    return userAccount;
  }

  /**
   * Returns info about the current connection.
   *
   * @returns The new account object.
   */
  public info(): IClientInfo {
    return {
      authed: this.authed,
      client: this.clientInfo,
      host: this.getHost(true),
      secure: this.secure,
    };
  }

  /**
   * Performs the login handshake with the server. You must do this
   * before you can do any other operations.
   *
   * @returns The authorized account.
   */
  public async auth() {
    const serverPubkey = await this.sendChallenge();
    let timeout = 1;
    while (!this.authed) {
      await Utils.sleep(timeout);
      timeout *= 2;
    }
    return serverPubkey;
  }

  private async sendChallenge(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(reject, 10000);

      const transmissionID = uuidv4();
      const challenge = uuidv4();
      const challengeMessage = {
        challenge,
        pubkey: Utils.toHexString(this.keyring.getPub()),
        transmissionID,
        type: "challenge",
      };

      this.subscribe(transmissionID, (msg: IResponse) => {
        if (
          this.keyring.verify(
            decodeUTF8(challenge),
            Utils.fromHexString(msg.response!),
            Utils.fromHexString(this.serverPubkey || msg.pubkey)
          )
        ) {
          if (!this.serverPubkey) {
            this.serverPubkey = msg.pubkey;
          }
          clearTimeout(timeout);
          resolve(this.serverPubkey);
        } else {
          reject(new Error("Server signature did not verify!"));
        }
      });

      this.getWs()!.send(JSON.stringify(challengeMessage));
    });
  }

  private async sendMessage(channelID: string, data: string) {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const chatMessage = {
        channelID,
        message: data,
        method: "CREATE",
        transmissionID,
        type: "chat",
      };
      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve();
        }
      });
      this.getWs()?.send(JSON.stringify(chatMessage));
    });
  }

  private async opUser(userID: string, powerLevel: number): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "UPDATE",
        powerLevel,
        transmissionID: uuidv4(),
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  /**
   * Creates a new channel.
   *
   * @returns The created channel object.
   */
  private createChannel(
    name: string,
    privateChannel: boolean
  ): Promise<IChannel> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "CREATE",
        name,
        privateChannel,
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private deleteChannel(channelID: string): Promise<IChannel> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        channelID,
        method: "DELETE",
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private grantChannel(
    userID: string,
    channelID: string
  ): Promise<IPermission> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "CREATE",
        permission: {
          channelID,
          userID,
        },
        transmissionID: uuidv4(),
        type: "channelPerm",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private revokeChannel(
    userID: string,
    channelID: string
  ): Promise<IPermission> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "DELETE",
        permission: {
          channelID,
          userID,
        },
        transmissionID: uuidv4(),
        type: "channelPerm",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private banUser(userID: string): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "BAN",
        transmissionID: uuidv4(),
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private kickUser(userID: string): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "KICK",
        transmissionID: uuidv4(),
        type: "user",
        userID,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(message));
    });
  }

  private async getHistory(
    channelID: string,
    topMessage: string = "00000000-0000-0000-0000-000000000000"
  ): Promise<IChatMessage[]> {
    return new Promise((resolve, reject) => {
      const transID = uuidv4();
      const historyReqMessage = {
        channelID,
        method: "RETRIEVE",
        topMessage,
        transmissionID: transID,
        type: "historyReq_v2",
      };

      this.subscribe(transID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "success") {
          resolve(msg.data);
        } else {
          reject(msg);
        }
      });
      this.ws?.send(JSON.stringify(historyReqMessage));
    });
  }

  private joinChannel(channelID: string): Promise<IChannel> {
    return new Promise((resolve, reject) => {
      if (this.connectedChannelList.includes(channelID)) {
        resolve();
      }

      const transmissionID = uuidv4();
      const joinMsg = {
        channelID,
        method: "JOIN",
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(joinMsg));
    });
  }

  private getHost(websocket: boolean): string {
    if (websocket) {
      return this.wsPrefix + this.host;
    } else {
      return this.httpPrefix + this.host;
    }
  }

  private async reconnect() {
    this.reconnecting = true;
    this.authed = false;
    await Utils.sleep(5000);
    await this.init();
    if (this.clientInfo) {
      await this.auth();

      if (this.connectedChannelList.length > 0) {
        for (const id of this.connectedChannelList) {
          // i need to remove it as well
          this.connectedChannelList.splice(
            this.connectedChannelList.indexOf(id),
            1
          );
          console.log("joining channel " + id);
          this.joinChannel(id);
        }
      }
    }
    this.reconnecting = false;
  }

  private async init() {
    this.keyring.init();
    const endpoint = "/socket";
    this.ws = new WebSocket(this.getHost(true) + endpoint);

    this.getWs()!.onopen = (event: WebSocket.OpenEvent) => {
      if (!this.reconnecting) {
        this.emit("ready");
      }
    };

    this.getWs()!.onclose = async (event: WebSocket.CloseEvent) => {
      console.log("close code " + event.code);
      this.getWs()!.close();
      switch (event.code) {
        case 1006:
          console.log("reconnecting...");
          this.reconnect();
          break;
        default:
          console.log("reconnecting...");
          this.reconnect();
          break;
      }
    };

    this.getWs()!.onerror = async (event: WebSocket.ErrorEvent) => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
      console.warn(event.error);

      await Utils.sleep(5000);
      this.reconnect();
    };

    this.getWs()!.onmessage = this.handleMessage.bind(this);
    this.initPing();
  }

  private getWs() {
    return this.ws;
  }

  // tslint:disable-next-line: ban-types
  private subscribe(id: string, callback: Function) {
    this.trxSubs.push({
      callback,
      id,
    });
  }

  private leaveChannel(channelID: string): Promise<IChannel> {
    return new Promise((resolve, reject) => {
      if (this.connectedChannelList.includes(channelID)) {
        resolve();
      }

      const transmissionID = uuidv4();
      const joinMsg = {
        channelID,
        method: "LEAVE",
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(joinMsg));
    });
  }

  private async registerUser(user: IClient): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();

      const message = {
        method: "REGISTER",
        pubkey: Utils.toHexString(this.keyring.getPub()),
        signed: Utils.toHexString(this.keyring.sign(decodeUTF8(user.userID))),
        transmissionID,
        type: "identity",
        uuid: user.userID,
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          this.clientInfo = msg.data;
          resolve(msg.data);
        }
      });

      this.getWs()!.send(JSON.stringify(message));
    });
  }

  private getChannelList(): Promise<IChannel[]> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const message = {
        method: "RETRIEVE",
        transmissionID,
        type: "channel",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()!.send(JSON.stringify(message));
    });
  }

  private async initPing() {
    let timeout = 1;
    while (!this.authed) {
      await Utils.sleep(timeout);
      timeout *= 2;
    }
    this.startPing();
  }

  private async respondToChallenge(jsonMessage: IChallenge): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();
      const challengeResponse = {
        pubkey: Utils.toHexString(this.keyring.getPub()),
        response: Utils.toHexString(
          this.keyring.sign(decodeUTF8(jsonMessage.challenge!))
        ),
        transmissionID,
        type: "response",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          this.authed = true;
          resolve(msg.data);
        }
      });

      this.getWs()?.send(JSON.stringify(challengeResponse));
    });
  }

  private async handleMessage(msg: WebSocket.MessageEvent) {
    try {
      const jsonMessage = JSON.parse(msg.data.toString());

      for (const sub of this.trxSubs) {
        if (sub.id === jsonMessage.transmissionID) {
          await sub.callback(jsonMessage);
          this.trxSubs.splice(this.trxSubs.indexOf(sub), 1);
          return;
        }
      }

      switch (jsonMessage.type) {
        case "history":
          this.history.push(jsonMessage);
          break;
        case "clientInfo":
          this.clientInfo = jsonMessage.Client;
          break;
        case "channelList":
          this.channelList = jsonMessage.channels;
          break;
        case "challenge":
          this.respondToChallenge(jsonMessage);
          break;
        case "chat":
          this.emit("message", jsonMessage);
          break;
        default:
          console.log(jsonMessage);
          break;
      }
    } catch (err) {
      this.emit("error", err);
    }
  }

  private async newUser(): Promise<IClient> {
    return new Promise((resolve, reject) => {
      const transmissionID = uuidv4();

      const registerMessage = {
        method: "CREATE",
        transmissionID,
        type: "identity",
      };

      this.subscribe(transmissionID, (msg: IApiSuccess | IApiError) => {
        if (msg.type === "error") {
          reject(msg);
        } else {
          resolve(msg.data);
        }
      });

      this.getWs()!.send(JSON.stringify(registerMessage));
    });
  }

  private async startPing() {
    let failedCount = 0;
    this.pingInterval = setInterval(async () => {
      if (this.serverAlive !== true) {
        failedCount++;
      } else {
        failedCount = 0;
      }
      if (failedCount > 2) {
        console.log("connection might be down");
      }
      this.serverAlive = false;
      const pongID = uuidv4();
      this.subscribe(pongID, (message: IApiPong) => {
        this.serverAlive = true;
      });
      this.getWs()?.send(
        JSON.stringify({ type: "ping", transmissionID: pongID })
      );
    }, 10000);
  }
}
