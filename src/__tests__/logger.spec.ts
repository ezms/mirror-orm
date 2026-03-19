import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleLogger } from '../logger/console.logger';
import { LoggingQueryRunner, LoggingTransactionRunner } from '../logger/logging-runner';
import { ILogger } from '../logger/logger.interface';
import { IQueryRunner } from '../interfaces/query-runner';
import { ITransactionRunner } from '../interfaces/transaction-runner';

// ─── ConsoleLogger ────────────────────────────────────────────────────────────

describe('ConsoleLogger', () => {
    it('logs SQL without params', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        new ConsoleLogger().query('SELECT 1');
        expect(spy).toHaveBeenCalledWith('[MirrorORM] SELECT 1');
        spy.mockRestore();
    });

    it('logs SQL with params as JSON', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        new ConsoleLogger().query('SELECT $1', [42]);
        expect(spy).toHaveBeenCalledWith('[MirrorORM] SELECT $1 -- [42]');
        spy.mockRestore();
    });

    it('does not append params info when array is empty', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        new ConsoleLogger().query('SELECT 1', []);
        expect(spy).toHaveBeenCalledWith('[MirrorORM] SELECT 1');
        spy.mockRestore();
    });
});

// ─── LoggingQueryRunner ───────────────────────────────────────────────────────

describe('LoggingQueryRunner', () => {
    let logger: ILogger;
    let innerRunner: IQueryRunner;

    beforeEach(() => {
        logger = { query: vi.fn() };
        innerRunner = { query: vi.fn().mockResolvedValue([{ id: 1 }]) };
    });

    it('logs and delegates query(string, params)', async () => {
        const runner = new LoggingQueryRunner(innerRunner, logger);
        const result = await runner.query('SELECT $1', [1]);

        expect(logger.query).toHaveBeenCalledWith('SELECT $1', [1]);
        expect(innerRunner.query).toHaveBeenCalledWith('SELECT $1', [1]);
        expect(result).toEqual([{ id: 1 }]);
    });

    it('logs and delegates query(INamedQuery)', async () => {
        const runner = new LoggingQueryRunner(innerRunner, logger);
        const namedQuery = { name: 'find_all', text: 'SELECT 1', values: [] };
        await runner.query(namedQuery);

        expect(logger.query).toHaveBeenCalledWith('SELECT 1', []);
    });

    it('wraps queryArray with string input', async () => {
        const mockQueryArray = vi.fn().mockResolvedValue([[1]]);
        innerRunner.queryArray = mockQueryArray;
        const runner = new LoggingQueryRunner(innerRunner, logger);

        await runner.queryArray!('SELECT 1', []);

        expect(logger.query).toHaveBeenCalledWith('SELECT 1', []);
        expect(mockQueryArray).toHaveBeenCalledWith('SELECT 1', []);
    });

    it('wraps queryArray with INamedQuery input', async () => {
        const mockQueryArray = vi.fn().mockResolvedValue([[1]]);
        innerRunner.queryArray = mockQueryArray;
        const runner = new LoggingQueryRunner(innerRunner, logger);
        const named = { name: 'q', text: 'SELECT 2', values: [42] };

        await runner.queryArray!(named);

        expect(logger.query).toHaveBeenCalledWith('SELECT 2', [42]);
    });

    it('wraps queryStream if inner runner exposes it', () => {
        const fakeStream = {};
        const mockStream = vi.fn().mockReturnValue(fakeStream);
        innerRunner.queryStream = mockStream;
        const runner = new LoggingQueryRunner(innerRunner, logger);

        const result = runner.queryStream!('SELECT 1', []);

        expect(logger.query).toHaveBeenCalledWith('SELECT 1', []);
        expect(result).toBe(fakeStream);
    });

    it('does not expose queryArray when inner runner lacks it', () => {
        const runner = new LoggingQueryRunner(innerRunner, logger);
        expect(runner.queryArray).toBeUndefined();
    });

    it('does not expose queryStream when inner runner lacks it', () => {
        const runner = new LoggingQueryRunner(innerRunner, logger);
        expect(runner.queryStream).toBeUndefined();
    });
});

// ─── LoggingTransactionRunner ─────────────────────────────────────────────────

describe('LoggingTransactionRunner', () => {
    let logger: ILogger;
    let innerTxRunner: ITransactionRunner;

    beforeEach(() => {
        logger = { query: vi.fn() };
        innerTxRunner = {
            query:    vi.fn().mockResolvedValue([]),
            commit:   vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
            release:  vi.fn(),
        };
    });

    it('delegates commit()', async () => {
        const runner = new LoggingTransactionRunner(innerTxRunner, logger);
        await runner.commit();
        expect(innerTxRunner.commit).toHaveBeenCalledOnce();
    });

    it('delegates rollback()', async () => {
        const runner = new LoggingTransactionRunner(innerTxRunner, logger);
        await runner.rollback();
        expect(innerTxRunner.rollback).toHaveBeenCalledOnce();
    });

    it('delegates release()', () => {
        const runner = new LoggingTransactionRunner(innerTxRunner, logger);
        runner.release();
        expect(innerTxRunner.release).toHaveBeenCalledOnce();
    });
});
