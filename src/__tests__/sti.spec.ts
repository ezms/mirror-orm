import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ChildEntity } from '../decorators/child-entity';
import { Column } from '../decorators/column';
import { Entity } from '../decorators/entity';
import { PrimaryColumn } from '../decorators/primary-column';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';

// ─── Hierarquia STI ──────────────────────────────────────────────────────────

@Entity({ tableName: 'vehicles', discriminatorColumn: 'kind' })
class Vehicle {
    @PrimaryColumn({ strategy: 'identity' }) id!: number;
    @Column() kind!: string;
    @Column() brand!: string;
}

@ChildEntity('car')
class Car extends Vehicle {
    @Column({ type: 'number' }) doors!: number;
}

@ChildEntity('truck')
class Truck extends Vehicle {
    @Column({ type: 'number' }) payload!: number;
}

void Vehicle; void Car; void Truck;

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('@ChildEntity (STI)', () => {
    let mockQuery: Mock;
    let runner: IQueryRunner;

    beforeEach(() => {
        mockQuery = vi.fn().mockResolvedValue([]);
        runner = { query: mockQuery };
    });

    describe('registro', () => {
        it('filho herda tableName do pai', () => {
            const meta = registry.getEntity('Car')!;
            expect(meta.tableName).toBe('vehicles');
        });

        it('filho carrega discriminatorValue', () => {
            const meta = registry.getEntity('Car')!;
            expect(meta.discriminatorValue).toBe('car');
        });

        it('filho herda colunas do pai + colunas próprias', () => {
            const meta = registry.getEntity('Car')!;
            const dbNames = meta.columns.map(c => c.databaseName);
            expect(dbNames).toContain('id');
            expect(dbNames).toContain('kind');
            expect(dbNames).toContain('brand');
            expect(dbNames).toContain('doors');
        });

        it('pai registra stiChildren com os filhos', () => {
            const meta = registry.getEntity('Vehicle')!;
            expect(meta.stiChildren?.get('car')).toBe(Car);
            expect(meta.stiChildren?.get('truck')).toBe(Truck);
        });
    });

    describe('SELECT — filho', () => {
        it('inclui colunas próprias do filho no SELECT', async () => {
            const repo = new Repository(Car, runner, registry.getEntity('Car')!);
            await repo.find({});
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('"doors"');
        });

        it('auto-adiciona WHERE kind = car no find()', async () => {
            const repo = new Repository(Car, runner, registry.getEntity('Car')!);
            await repo.find({});
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toMatch(/WHERE.*kind.*=.*'car'/);
        });

        it('auto-adiciona WHERE kind = car no findAll()', async () => {
            const repo = new Repository(Car, runner, registry.getEntity('Car')!);
            await repo.findAll();
            const [stmt] = mockQuery.mock.calls[0];
            const text = typeof stmt === 'string' ? stmt : (stmt as { text: string }).text;
            expect(text).toMatch(/WHERE.*kind.*=.*'car'/);
        });
    });

    describe('hydration polimórfica — base entity', () => {
        it('instancia Car quando kind = car', async () => {
            mockQuery.mockResolvedValueOnce([
                { id: 1, kind: 'car', brand: 'Toyota', doors: 4 },
            ]);
            const repo = new Repository(Vehicle, runner, registry.getEntity('Vehicle')!);
            const [v] = await repo.find({});
            expect(v).toBeInstanceOf(Car);
        });

        it('instancia Truck quando kind = truck', async () => {
            mockQuery.mockResolvedValueOnce([
                { id: 2, kind: 'truck', brand: 'Scania', payload: 20000 },
            ]);
            const repo = new Repository(Vehicle, runner, registry.getEntity('Vehicle')!);
            const [v] = await repo.find({});
            expect(v).toBeInstanceOf(Truck);
        });

        it('instancia Vehicle para discriminador desconhecido', async () => {
            mockQuery.mockResolvedValueOnce([
                { id: 3, kind: 'bus', brand: 'Mercedes' },
            ]);
            const repo = new Repository(Vehicle, runner, registry.getEntity('Vehicle')!);
            const [v] = await repo.find({});
            expect(v).toBeInstanceOf(Vehicle);
            expect(v).not.toBeInstanceOf(Car);
        });
    });

    describe('INSERT — filho', () => {
        it('auto-injeta discriminatorValue no INSERT', async () => {
            mockQuery.mockResolvedValueOnce([{ id: 1, kind: 'car', brand: 'Honda', doors: 2 }]);
            const repo = new Repository(Car, runner, registry.getEntity('Car')!);

            const car = Object.assign(new Car(), { brand: 'Honda', doors: 2 });
            await repo.save(car);

            const [sql, params] = mockQuery.mock.calls[0];
            expect(sql).toMatch(/^INSERT/);
            expect(params).toContain('car');
            expect(params).toContain('Honda');
        });
    });
});
