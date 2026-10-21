export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface BikeData {
  powerW?: number;
  cadenceRpm?: number;
  speedKmh?: number;
  receivedAt: number; // performance.now()
}

export interface Trainer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(cb: (d: BikeData) => void): () => void; // returns unsubscribe
  onStateChange(cb: (s: ConnectionState) => void): () => void;
  setTargetPower(watts: number): Promise<void>;
  setGrade(percent: number): Promise<void>;
}

export interface HeartRateMonitor {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(cb: (bpm: number) => void): () => void;
  onStateChange(cb: (s: ConnectionState) => void): () => void;
}
