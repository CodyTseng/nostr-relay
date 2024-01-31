import { MessageType } from '@nostr-relay/common';
import { Validator } from '../src/validator';

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('validateIncomingMessage', () => {
    it('should validate event message', async () => {
      const event = {
        id: '0000000000000000000000000000000000000000000000000000000000000000',
        pubkey:
          '0000000000000000000000000000000000000000000000000000000000000000',
        kind: 1,
        content: 'hello nostr',
        tags: [['hello', 'world']],
        created_at: 0,
        sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };
      const eventMessage = [MessageType.EVENT, event];

      expect(await validator.validateIncomingMessage(eventMessage)).toEqual(
        eventMessage,
      );
      expect(
        await validator.validateIncomingMessage(JSON.stringify(eventMessage)),
      ).toEqual(eventMessage);
      expect(
        await validator.validateIncomingMessage(
          Buffer.from(JSON.stringify(eventMessage)),
        ),
      ).toEqual(eventMessage);
    });

    it('should throw error if event message is invalid', async () => {
      const event = {
        id: '0',
        pubkey:
          '0000000000000000000000000000000000000000000000000000000000000000',
        kind: 1,
        content: 'hello nostr',
        tags: [['hello', 'world']],
        created_at: 0,
        sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };
      const eventMessage = [MessageType.EVENT, event];

      await expect(
        validator.validateIncomingMessage(eventMessage),
      ).rejects.toThrow('invalid:');

      jest
        .spyOn(validator['incomingMessageSchema'], 'parseAsync')
        .mockRejectedValue(new Error('test'));
      await expect(
        validator.validateIncomingMessage(eventMessage),
      ).rejects.toThrow('test');
    });

    it('should validate req message', async () => {
      expect(
        await validator.validateIncomingMessage([
          MessageType.REQ,
          'subscriptionId',
          { kinds: [0, 1] },
          {
            ids: [
              '0000000000000000000000000000000000000000000000000000000000000000',
            ],
          },
          {
            authors: [
              '0000000000000000000000000000000000000000000000000000000000000000',
              '1111111111111111111111111111111111111111111111111111111111111111',
            ],
            kinds: [0, 1],
          },
          {
            since: 1700000000000,
            until: 1701000000000,
            limit: 10,
          },
          {
            '#t': ['hello', 'world'],
            '#ignore': ['hello', 'world'],
            kinds: [0, 1],
          },
        ]),
      ).toEqual([
        MessageType.REQ,
        'subscriptionId',
        { kinds: [0, 1] },
        {
          ids: [
            '0000000000000000000000000000000000000000000000000000000000000000',
          ],
        },
        {
          authors: [
            '0000000000000000000000000000000000000000000000000000000000000000',
            '1111111111111111111111111111111111111111111111111111111111111111',
          ],
          kinds: [0, 1],
        },
        {
          since: 1700000000000,
          until: 1701000000000,
          limit: 10,
        },
        {
          '#t': ['hello', 'world'],
          kinds: [0, 1],
        },
      ]);
    });

    it('should validate close message', async () => {
      expect(
        await validator.validateIncomingMessage([
          MessageType.CLOSE,
          'subscriptionId',
        ]),
      ).toEqual([MessageType.CLOSE, 'subscriptionId']);
    });

    it('should validate auth message', async () => {
      const event = {
        id: '0000000000000000000000000000000000000000000000000000000000000000',
        pubkey:
          '0000000000000000000000000000000000000000000000000000000000000000',
        kind: 1,
        content: 'hello nostr',
        tags: [['hello', 'world']],
        created_at: 0,
        sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };
      const authMessage = [MessageType.AUTH, event];

      expect(await validator.validateIncomingMessage(authMessage)).toEqual(
        authMessage,
      );
    });
  });

  describe('validateFilter', () => {
    it('should validate filter', async () => {
      const filter = {
        ids: [
          '0000000000000000000000000000000000000000000000000000000000000000',
        ],
        authors: [
          '0000000000000000000000000000000000000000000000000000000000000000',
          '1111111111111111111111111111111111111111111111111111111111111111',
        ],
        kinds: [0, 1],
        since: 1700000000000,
        until: 1701000000000,
        limit: 10,
        '#t': ['hello', 'world'],
      };
      await expect(validator.validateFilter(filter)).resolves.toEqual(filter);
    });
  });

  describe('validateEvent', () => {
    it('should validate event', async () => {
      const event = {
        id: '0000000000000000000000000000000000000000000000000000000000000000',
        pubkey:
          '0000000000000000000000000000000000000000000000000000000000000000',
        kind: 1,
        content: 'hello nostr',
        tags: [['hello', 'world']],
        created_at: 0,
        sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };

      expect(await validator.validateEvent(event)).toEqual(event);
    });

    it('should validate tag value correctly', async () => {
      const specValidator = new Validator({ maxTagValueLength: 1 });
      const event1 = {
        id: '0000000000000000000000000000000000000000000000000000000000000000',
        pubkey:
          '0000000000000000000000000000000000000000000000000000000000000000',
        kind: 1,
        content: 'hello nostr',
        tags: [
          ['hello', 'world'],
          ['a', 'b', 'ccc'],
        ],
        created_at: 0,
        sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };
      expect(await specValidator.validateEvent(event1)).toEqual(event1);

      const event2 = {
        id: '0000000000000000000000000000000000000000000000000000000000000000',
        pubkey:
          '0000000000000000000000000000000000000000000000000000000000000000',
        kind: 1,
        content: 'hello nostr',
        tags: [
          ['hello', 'world'],
          ['a', 'bb'],
        ],
        created_at: 0,
        sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };
      await expect(specValidator.validateEvent(event2)).rejects.toThrow();
    });
  });
});
