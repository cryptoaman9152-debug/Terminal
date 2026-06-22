/**
 * WATCHLIST REPOSITORY
 * 
 * Database operations for watchlists table.
 * Scoped by userId.
 */

import { BaseRepository } from './base.repository.js';

export class WatchlistRepository extends BaseRepository {
  constructor() {
    super('watchlists');
  }

  async findByUserId(userId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(`[watchlists] findByUserId failed: ${error.message}`);
    return data || [];
  }

  async createWatchlist(userId, params) {
    // Get next sort order
    const existing = await this.findByUserId(userId);
    const nextOrder = existing.length > 0
      ? Math.max(...existing.map(w => w.sort_order)) + 1
      : 0;

    return this.insert({
      user_id: userId,
      name: params.name,
      color: params.color || '#2962ff',
      items: params.items || [],
      sort_order: params.sortOrder ?? nextOrder,
    });
  }

  async updateItems(watchlistId, items) {
    return this.update(watchlistId, { items });
  }

  async updateName(watchlistId, name) {
    return this.update(watchlistId, { name });
  }

  async updateColor(watchlistId, color) {
    return this.update(watchlistId, { color });
  }

  async reorder(userId, orderedIds) {
    const updates = orderedIds.map((id, index) =>
      this.update(id, { sort_order: index })
    );
    await Promise.all(updates);
    return true;
  }

  async addItem(watchlistId, item) {
    const watchlist = await this.findById(watchlistId);
    if (!watchlist) throw new Error('Watchlist not found');

    const items = watchlist.items || [];
    // Avoid duplicates
    if (items.some(i => i.token === item.token)) {
      return watchlist;
    }

    items.push(item);
    return this.update(watchlistId, { items });
  }

  async removeItem(watchlistId, token) {
    const watchlist = await this.findById(watchlistId);
    if (!watchlist) throw new Error('Watchlist not found');

    const items = (watchlist.items || []).filter(i => i.token !== token);
    return this.update(watchlistId, { items });
  }

  async deleteWatchlist(watchlistId) {
    return this.delete(watchlistId);
  }
}

