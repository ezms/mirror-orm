import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Column } from '../decorators/column';
import { Embedded } from '../decorators/embedded';
import { Entity } from '../decorators/entity';
import { PrimaryColumn } from '../decorators/primary-column';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';

// ─── Embedded value object ────────────────────────────────────────────────────

class Address {
    @Column() street!: string;
    @Column() city!: string;
}

class Money {
    @Column({ type: 'number' }) amount!: number;
    @Column() currency!: string;
}

// ─── Parent entities ──────────────────────────────────────────────────────────

@Entity('customers')
class CustomerFixture {
    @PrimaryColumn({ strategy: 'identity' }) id!: number;
    @Column() name!: string;
    @Embedded(() => Address) address!: Address;
}

@Entity('orders')
class OrderFixture {
    @PrimaryColumn({ strategy: 'identity' }) id!: number;
    @Embedded(() => Money, 'price_') price!: Money;
}

void CustomerFixture;
void OrderFixture;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('@Embedded', () => {
    let mockQuery: Mock;
    let runner: IQueryRunner;

    beforeEach(() => {
        mockQuery = vi.fn().mockResolvedValue([]);
        runner = { query: mockQuery };
    });

    describe('column expansion', () => {
        it('expands embedded columns into parent metadata with default prefix', () => {
            const meta = registry.getEntity('CustomerFixture')!;
            const dbNames = meta.columns.map((c) => c.databaseName);
            expect(dbNames).toContain('address_street');
            expect(dbNames).toContain('address_city');
        });

        it('expands embedded columns with custom prefix', () => {
            const meta = registry.getEntity('OrderFixture')!;
            const dbNames = meta.columns.map((c) => c.databaseName);
            expect(dbNames).toContain('price_amount');
            expect(dbNames).toContain('price_currency');
        });

        it('expanded columns carry embedOwnerKey and embedSourceKey', () => {
            const meta = registry.getEntity('CustomerFixture')!;
            const streetCol = meta.columns.find(
                (c) => c.databaseName === 'address_street',
            )!;
            expect(streetCol.embedOwnerKey).toBe('address');
            expect(streetCol.embedSourceKey).toBe('street');
        });
    });

    describe('SELECT', () => {
        it('includes prefixed columns in SELECT clause', async () => {
            const repo = new Repository(
                CustomerFixture,
                runner,
                registry.getEntity('CustomerFixture')!,
            );
            await repo.find({});
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('"address_street"');
            expect(sql).toContain('"address_city"');
        });
    });

    describe('hydration', () => {
        it('builds embedded object from prefixed row columns', async () => {
            const repo = new Repository(
                CustomerFixture,
                runner,
                registry.getEntity('CustomerFixture')!,
            );
            mockQuery.mockResolvedValueOnce([
                {
                    id: 1,
                    name: 'Alice',
                    address_street: 'Rua A',
                    address_city: 'SP',
                },
            ]);

            const [customer] = await repo.find({});

            expect(customer.address).toBeInstanceOf(Address);
            expect(customer.address.street).toBe('Rua A');
            expect(customer.address.city).toBe('SP');
        });

        it('applies type cast to embedded columns', async () => {
            const repo = new Repository(
                OrderFixture,
                runner,
                registry.getEntity('OrderFixture')!,
            );
            mockQuery.mockResolvedValueOnce([
                {
                    id: 1,
                    price_amount: '99.90',
                    price_currency: 'BRL',
                },
            ]);

            const [order] = await repo.find({});

            expect(order.price).toBeInstanceOf(Money);
            expect(order.price.amount).toBe(99.9);
            expect(typeof order.price.amount).toBe('number');
        });
    });

    describe('INSERT', () => {
        it('flattens embedded object into prefixed columns for INSERT', async () => {
            mockQuery.mockResolvedValueOnce([
                {
                    id: 1,
                    name: 'Bob',
                    address_street: 'Rua B',
                    address_city: 'RJ',
                },
            ]);
            const repo = new Repository(
                CustomerFixture,
                runner,
                registry.getEntity('CustomerFixture')!,
            );

            const customer = Object.assign(new CustomerFixture(), {
                name: 'Bob',
                address: Object.assign(new Address(), {
                    street: 'Rua B',
                    city: 'RJ',
                }),
            });
            await repo.save(customer);

            const [sql, params] = mockQuery.mock.calls[0];
            expect(sql).toMatch(/^INSERT/);
            expect(params).toContain('Rua B');
            expect(params).toContain('RJ');
        });
    });

    describe('UPDATE dirty tracking', () => {
        it('detects change in embedded field and includes it in SET', async () => {
            mockQuery.mockResolvedValueOnce([
                {
                    id: 1,
                    name: 'Alice',
                    address_street: 'Nova Rua',
                    address_city: 'SP',
                },
            ]);
            const repo = new Repository(
                CustomerFixture,
                runner,
                registry.getEntity('CustomerFixture')!,
            );

            // Simulate a loaded entity (snapshot captured)
            const customer = repo['state'].hydrator({
                id: 1,
                name: 'Alice',
                address_street: 'Rua A',
                address_city: 'SP',
            });
            repo['captureSnapshot'](customer);

            customer.address.street = 'Nova Rua';
            await repo.save(customer);

            const [sql, params] = mockQuery.mock.calls[0];
            expect(sql).toMatch(/^UPDATE/);
            expect(params).toContain('Nova Rua');
        });

        it('no-op when embedded values are unchanged', async () => {
            const repo = new Repository(
                CustomerFixture,
                runner,
                registry.getEntity('CustomerFixture')!,
            );

            const customer = repo['state'].hydrator({
                id: 1,
                name: 'Alice',
                address_street: 'Rua A',
                address_city: 'SP',
            });
            repo['captureSnapshot'](customer);

            // No changes
            await repo.save(customer);

            // No query should have been issued (dirty columns = 0)
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });
});
