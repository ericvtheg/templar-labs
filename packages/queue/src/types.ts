export type QueueMetadata = Readonly<Record<string, string>>;

export type QueueSendOptions = {
  readonly delaySeconds?: number;
  readonly metadata?: QueueMetadata;
};

export type QueueMessageInput<A> = QueueSendOptions & {
  readonly body: A;
};

export type QueueDelivery = {
  readonly id: string;
  readonly body: string;
  readonly timestamp: Date;
};

export type QueueMessage<A> = {
  readonly id: string;
  readonly body: A;
  readonly timestamp: Date;
  readonly metadata: QueueMetadata | undefined;
};

export type QueueDriverSendInput = QueueSendOptions & {
  readonly body: string;
};
