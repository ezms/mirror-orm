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
}
