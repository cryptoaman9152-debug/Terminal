/**
 * USER REPOSITORY
 * 
 * Database operations for users table.
 */

import { BaseRepository } from './base.repository.js';

export class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  async findByFwUserId(fwUserId) {
    return this.findOne({ fw_user_id: fwUserId });
  }

  async findByEmail(email) {
    return this.findOne({ email });
  }

  async findActive(userId) {
    const user = await this.findById(userId);
    if (!user) return null;
    if (user.status !== 'active') return null;
    return user;
  }

  async createOrUpdate(fwUserId, data) {
    const existing = await this.findByFwUserId(fwUserId);

    if (existing) {
      return this.update(existing.id, {
        email: data.email || existing.email,
        name: data.name || existing.name,
      });
    } else {
      return this.insert({
        fw_user_id: fwUserId,
        email: data.email,
        name: data.name,
        status: 'active',
      });
    }
  }

  async suspend(userId) {
    return this.update(userId, { status: 'suspended' });
  }

  async activate(userId) {
    return this.update(userId, { status: 'active' });
  }
}

