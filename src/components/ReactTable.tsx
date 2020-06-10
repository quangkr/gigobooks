import * as React from 'react'
import { Row, Column, useTable, usePagination } from 'react-table'
export { Column } from 'react-table'

// This is some integration magic
// If a row has .id, use that as the unique id.
function getRowId<D extends {id?: any}>(row: D, relativeIndex: number, parent: Row<D> | undefined) {
    const id = row.id !== undefined ? row.id : relativeIndex
    return parent ? [parent.id, id].join('.') : id
}

type Props<D extends object> = {
    columns: Column<D>[],
    data: D[],
    fetchData: (options: {
        pageSize: number
        pageIndex: number
    }) => void,
    pageCount: number,
}

export function ReactTable<D extends object>(props: Props<D>) {
    const table = useTable<D>({
        columns: props.columns,
        data: props.data,
        initialState: { pageIndex: 0 },
        manualPagination: true,
        pageCount: props.pageCount,
        getRowId: getRowId,
    } as any, usePagination)
    const { canPreviousPage, canNextPage, pageOptions, pageCount, gotoPage,
        nextPage, previousPage, setPageSize, state: { pageIndex, pageSize },
    } = table as any

    React.useEffect(() => {
        props.fetchData({pageSize, pageIndex})
    }, [props.fetchData, pageSize, pageIndex])

    const tablePane = <table {...table.getTableProps()}>
        <thead>
        {table.headerGroups.map(headerGroup => (
            <tr {...headerGroup.getHeaderGroupProps()}>
            {headerGroup.headers.map(column => (
                <th {...column.getHeaderProps()}>
                {column.render('Header')}
                </th>
            ))}
            </tr>
        ))}
        </thead>
        <tbody {...table.getTableBodyProps()}>
        {table.rows.map(row => {
            table.prepareRow(row)
            return (
            <tr {...row.getRowProps()}>
                {row.cells.map(cell => {
                return (
                    <td {...cell.getCellProps()}>
                    {cell.render('Cell')}
                    </td>
                )
                })}
            </tr>
            )
        })}
        </tbody>
    </table>

    const paginationPane = props.pageCount > 0 ? <div className="pagination">
        <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>
            {'<<'}
        </button>&nbsp;
        <button onClick={() => previousPage()} disabled={!canPreviousPage}>
            {'<'}
        </button>&nbsp;
        <button onClick={() => nextPage()} disabled={!canNextPage}>
            {'>'}
        </button>&nbsp;
        <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>
            {'>>'}
        </button>&nbsp;
        <span>Page {pageIndex + 1} of {pageOptions.length}</span>
        &nbsp;|&nbsp;
        <span>
            <label>Go to page:</label>
            <input
                defaultValue={pageIndex + 1}
                onChange={e => {
                    const page = e.target.value ? Number(e.target.value) - 1 : 0
                    gotoPage(page)
                }}
            />
        </span>
        &nbsp;
        <select value={pageSize} onChange={e => {setPageSize(Number(e.target.value))}}>
            {[10, 20, 30, 40, 50].map(pageSize => (
            <option key={pageSize} value={pageSize}>
                Show {pageSize}
            </option>
            ))}
        </select>
    </div> : null

    return <>
        {tablePane}
        {paginationPane}
    </>
}

export default ReactTable
