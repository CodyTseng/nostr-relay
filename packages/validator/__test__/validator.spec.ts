import { MessageType } from '@nostr-relay/common';
import { Validator } from '../src/validator';

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('event message', () => {
    it('should transform and validate event message', async () => {
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

      expect(validator.transformAndValidate(eventMessage)).toEqual(
        eventMessage,
      );
      expect(
        validator.transformAndValidate(JSON.stringify(eventMessage)),
      ).toEqual(eventMessage);
      expect(
        validator.transformAndValidate(
          Buffer.from(JSON.stringify(eventMessage)),
        ),
      ).toEqual(eventMessage);

      expect(await validator.transformAndValidateAsync(eventMessage)).toEqual(
        eventMessage,
      );
      expect(
        await validator.transformAndValidateAsync(JSON.stringify(eventMessage)),
      ).toEqual(eventMessage);
      expect(
        await validator.transformAndValidateAsync(
          Buffer.from(JSON.stringify(eventMessage)),
        ),
      ).toEqual(eventMessage);
    });

    it('should throw error if event message is invalid', () => {
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

      expect(() => validator.transformAndValidate(eventMessage)).toThrow(
        'invalid:',
      );
      expect(validator.transformAndValidateAsync(eventMessage)).rejects.toThrow(
        'invalid:',
      );

      jest.spyOn(validator['schema'], 'parse').mockImplementation(() => {
        throw new Error('test');
      });
      expect(() => validator.transformAndValidate(eventMessage)).toThrow(
        'test',
      );

      jest
        .spyOn(validator['schema'], 'parseAsync')
        .mockRejectedValue(new Error('test'));
      expect(validator.transformAndValidateAsync(eventMessage)).rejects.toThrow(
        'test',
      );
    });
  });

  describe('req message', () => {
    it('should transform and validate req message', async () => {
      expect(
        validator.transformAndValidate([
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
  });

  describe('close message', () => {
    it('should transform and validate close message', async () => {
      expect(
        validator.transformAndValidate([MessageType.CLOSE, 'subscriptionId']),
      ).toEqual([MessageType.CLOSE, 'subscriptionId']);
    });
  });

  describe('auth message', () => {
    it('should transform and validate auth message', async () => {
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

      expect(validator.transformAndValidate(authMessage)).toEqual(authMessage);
    });
  });
});
