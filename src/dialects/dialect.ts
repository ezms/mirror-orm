export interface IDialect {
    /**
     * Wraps an identifier (table or column name) in the appropriate
     * quoting characters for this database, escaping any internal occurrences
     * of the quote character.
     *
     * PostgreSQL: "identifier"  (double-quote, escape " → "")
     * MySQL:      `identifier`  (backtick, escape ` → ``)
     * SQL Server: [identifier]  (brackets, escape ] → ]])
     */
    quoteIdentifier(identifier: string): string;

    /**
     * Returns the parameter placeholder for the given 1-based index.
     *
     * PostgreSQL: $1, $2, $3
     * MySQL/SQLite: ? (index ignored)
     * Oracle: :1, :2, :3
     * SQL Server: @p1, @p2, @p3
     */
    placeholder(index: number): string;

    /**
     * Whether this database supports RETURNING after INSERT/UPDATE/DELETE.
     * PostgreSQL: true. MySQL, SQLite (< 3.35), SQL Server: false.
     */
    readonly supportsReturning: boolean;
}
