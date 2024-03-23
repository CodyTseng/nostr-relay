import { EventId, Pubkey } from './common.interface';

export interface Filter {
  ids?: EventId[];
  authors?: Pubkey[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  // stupid but simple (generated by copilot)
  '#a'?: string[];
  '#b'?: string[];
  '#c'?: string[];
  '#d'?: string[];
  '#e'?: string[];
  '#f'?: string[];
  '#g'?: string[];
  '#h'?: string[];
  '#i'?: string[];
  '#j'?: string[];
  '#k'?: string[];
  '#l'?: string[];
  '#m'?: string[];
  '#n'?: string[];
  '#o'?: string[];
  '#p'?: string[];
  '#q'?: string[];
  '#r'?: string[];
  '#s'?: string[];
  '#t'?: string[];
  '#u'?: string[];
  '#v'?: string[];
  '#w'?: string[];
  '#x'?: string[];
  '#y'?: string[];
  '#z'?: string[];
  '#A'?: string[];
  '#B'?: string[];
  '#C'?: string[];
  '#D'?: string[];
  '#E'?: string[];
  '#F'?: string[];
  '#G'?: string[];
  '#H'?: string[];
  '#I'?: string[];
  '#J'?: string[];
  '#K'?: string[];
  '#L'?: string[];
  '#M'?: string[];
  '#N'?: string[];
  '#O'?: string[];
  '#P'?: string[];
  '#Q'?: string[];
  '#R'?: string[];
  '#S'?: string[];
  '#T'?: string[];
  '#U'?: string[];
  '#V'?: string[];
  '#W'?: string[];
  '#X'?: string[];
  '#Y'?: string[];
  '#Z'?: string[];
}