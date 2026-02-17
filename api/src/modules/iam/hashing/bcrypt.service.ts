import { Injectable } from '@nestjs/common';
import { compare, genSalt, hash } from 'bcrypt';
import { HashingService } from './hashing.service';

const BCRYPT_COST_FACTOR = 12;

@Injectable()
export class BcryptService implements HashingService {
  async hash(data: string | Buffer): Promise<string> {
    const normalized = typeof data === 'string' ? data.normalize('NFC') : data;
    const salt = await genSalt(BCRYPT_COST_FACTOR);
    return hash(normalized, salt);
  }

  compare(data: string | Buffer, encrypted: string): Promise<boolean> {
    const normalized = typeof data === 'string' ? data.normalize('NFC') : data;
    return compare(normalized, encrypted);
  }
}
