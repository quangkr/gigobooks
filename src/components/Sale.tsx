/**
 * Copyright (c) 2020-present Beng Tan
 */

import * as React from 'react'
import { Controller, useForm, useFieldArray, ArrayField, FormContextValues as FCV } from 'react-hook-form'
import { Link, Redirect } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import { TransactionOrKnex, Model,
    Project, Transaction, TransactionType, Account, Actor, IElement,
    dateFormatString as dfs, toDateOnly, parseISO, lastSavedDate,
    toFormatted, parseFormatted, TaxCodeInfo, hasActiveTaxAuthority } from '../core'
import { validateElementAmounts, validateElementTaxAmounts } from '../util/util'
import { playSuccess, playAlert } from '../util/sound'
import { MaybeSelect, hashSelectOptions, flatSelectOptions, currencySelectOptions, taxSelectOptions } from './SelectOptions'
import { formCalculateTaxes } from './form'
import InvoicePayment from './InvoicePayment'

type Props = {
    arg1?: string
}

export type FormData = {
    type: TransactionType
    actorId: number
    actorTitle?: string
    date: Date
    due?: Date | ''
    description?: string
    elements: {
        // `.id` is used by the form system so we have eId to store 'our' id
        eId?: number
        accountId: number
        amount: string
        _amount?: number        // Needed for calculation. Not a form element
        currency: string
        useGross: number
        grossAmount: string
        description?: string
        taxes?: {
            eId?: number
            baseCode: string
            tag: string
            rate: string
            amount: string
            _amount?: number        // Needed for calculation. Not a form element
        }[]
    }[]
    submit?: string    // Only for displaying general submit error messages
}

export default function Sale(props: Props) {
    // argId == 0 means creating a new transaction
    const argId = /^\d+$/.test(props.arg1!) ? Number(props.arg1) : 0

    const [transaction, setTransaction] = React.useState<Transaction>()
    const [prevId, setPrevId] = React.useState<number>(-1)
    const [nextId, setNextId] = React.useState<number>(-1)
    const [revenueOptions, setRevenueOptions] = React.useState<{}>()
    const [customerOptions, setCustomerOptions] = React.useState<{}>()
    const [actorTitleEnable, setActorTitleEnable] = React.useState<boolean>(false)
    const [redirectId, setRedirectId] = React.useState<number>(-1)
    let action = ''

    const form = useForm<FormData>()
    const type = form.watch('type')
    const {fields, append} = useFieldArray({control: form.control, name: 'elements'})

    function clearForm() {
        const currency = Project.variables.get('currency')
        form.reset({
            actorId: 0,
            date: lastSavedDate(),
            elements: [{currency}],
        })
    }

    // Initialise a lot of stuff
    React.useEffect(() => {
        let mounted = true

        // Clear redirectId
        setRedirectId(-1)

        // Load revenue accounts
        Account.query().select()
        .whereIn('type', Account.TypeGroupInfo[Account.Revenue].types)
        .orderBy(['title'])
        .then((rows) => {
            if (mounted) {
                setRevenueOptions(flatSelectOptions(rows))
            }
        })

        // Load customers
        Actor.query().select()
        .where('type', Actor.Customer)
        .orderBy('title')
        .then((rows: any[]) => {
            if (mounted) {
                rows.push({id: Actor.NewCustomer, title: '<new customer>', type: Actor.Customer})
                setCustomerOptions(flatSelectOptions(rows))
            }
        })

        // Load transaction (if exists) and initialise form accordingly
        if (argId > 0) {
            Transaction.query().findById(argId).whereIn('type', [Transaction.Sale, Transaction.Invoice])
            .withGraphFetched('elements')
            .then(t => {
                if (t && mounted) {
                    setTransaction(t)
                    // Even though `mounted` was true recently, it seems to be
                    // volatile so we need to check it again.
                    // Actually, this is a work-around since form.reset() should
                    // take care not to modify unmounted components ??
                    if (mounted) {
                        form.reset(extractFormValues(t))

                        // Prev
                        Transaction.prevId(t, [Transaction.Sale, Transaction.Invoice]).then(id => {
                            if (mounted) {
                                setPrevId(id)
                            }
                        })

                        // Next
                        Transaction.nextId(t, [Transaction.Sale, Transaction.Invoice]).then(id => {
                            if (mounted) {
                                setNextId(id)
                            }
                        })
                    }
                }
            })
        }
        else {
            setTransaction(Transaction.construct({}))
            clearForm()

            // Prev
            Transaction.prevId(undefined, [Transaction.Sale, Transaction.Invoice]).then(id => {
                if (mounted) {
                    setPrevId(id)
                }
            })

            // Next
            setNextId(0)
        }

        return () => {mounted=false}
    }, [props.arg1, transaction && transaction.id && transaction.updatedAt ? transaction.updatedAt.toString() : 0])

    const onSubmit = (data: FormData) => {
        if (!validateFormData(form, data)) {
            playAlert()
            return
        }

        Model.transaction(trx => saveFormData(transaction!, data, trx)).then(savedId => {
            if (savedId) {
                playSuccess()
                // This form.reset() triggers the warning:
                // 'Can't perform a React state update on an unmounted component. '
                // Again, I think this is a bug within form.reset()
                form.reset(extractFormValues(transaction!))
                setActorTitleEnable(false)

                if (action == '' && argId != savedId) {
                    setRedirectId(savedId)
                }
                else if (action == 'and-new') {
                    clearForm()
                    if (argId != 0) {
                        setRedirectId(0)
                    }
                }
            }
        }).catch(e => {
            playAlert()
            form.setError('submit', '', e.toString())
        })
    }

    if (redirectId >= 0 && redirectId != argId) {
        return <Redirect to={`/sales/${redirectId ? redirectId : 'new'}`} />
    }
    else if (transaction && prevId >= 0 && nextId >= 0 && revenueOptions && customerOptions) {
        const saleForm = <div>
            <div className='title-pane'>
                <span className='breadcrumb'><Link to='/sales'>Sales</Link> » </span>
                <h1 className='title inline'>
                    {transaction.id ? `${Transaction.TypeInfo[transaction.type!].label} ${transaction.id}` : 'New sale'}
                </h1>
                <span className='tasks'>
                    {transaction.id && <><Link to={`/sales/${transaction.id}/pdf`}>PDF</Link>&nbsp;|&nbsp;</>}
                    {prevId ? <Link to={`/sales/${prevId}`}>Prev</Link> : <span className='disabled'>Prev</span>}
                    &nbsp;|&nbsp;
                    {argId == 0 ? <span className='disabled'>Next</span> : <Link to={`/sales/${nextId ? nextId : 'new'}`}>Next</Link>}
                </span>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className='transaction-form'>
                <table className='horizontal-table-form transaction-fields'><tbody><tr className='row row-type'>
                    <th scope='row'>
                        <label htmlFor='type'>Type:</label>
                    </th><td>
                        <select name='type' ref={form.register} disabled={!!transaction.id}>
                            {!transaction.type && <option key='' value=''></option>}
                            <option key={Transaction.Sale} value={Transaction.Sale}>
                                {Transaction.TypeInfo[Transaction.Sale].label}
                            </option>
                            <option key={Transaction.Invoice} value={Transaction.Invoice}>
                                {Transaction.TypeInfo[Transaction.Invoice].label}
                            </option>
                        </select>
                        {form.errors.type && <span className='error'>
                            {form.errors.type.message}
                        </span>}
                    </td>
                </tr><tr className='row row-actor'>
                    <th scope='row'>
                        <label htmlFor='actorId'>Customer:</label>
                    </th><td>
                        <select
                            name='actorId'
                            onChange={e => {
                                const value = Number(e.target.value)
                                setActorTitleEnable(value == Actor.NewCustomer)
                            }}
                            ref={form.register}>
                            {customerOptions}
                        </select>
                        {form.errors.actorId && <span className='error'>
                            {form.errors.actorId.message}
                        </span>}

                        {actorTitleEnable && <span className='actor-title'>
                            <label htmlFor='actorTitle'>Name:</label>
                            <input name='actorTitle' ref={form.register} />
                            {form.errors.actorTitle && <span className='error'>
                                {form.errors.actorTitle.message}
                            </span>}
                        </span>}
                    </td>
                </tr><tr className='row row-date'>
                    <th scope='row'>
                        <label htmlFor='date'>Date:</label>
                    </th><td>
                        <Controller
                            // No-op for DatePicker.onChange()
                            as={<DatePicker dateFormat={dfs()} onChange={() => {}} />}
                            control={form.control}
                            register={form.register()}
                            name='date'
                            valueName='selected'
                            onChange={([selected]) => selected}
                        />
                        {form.errors.date && <span className='error'>
                            {form.errors.date.message}
                        </span>}
                    </td>
                </tr>{type == TransactionType.Invoice && <tr className='row row-due'>
                    <th scope='row'>
                        <label htmlFor='due'>Due date:</label>
                    </th><td>
                        <Controller
                            // No-op for DatePicker.onChange()
                            as={<DatePicker dateFormat={dfs()} onChange={() => {}} />}
                            control={form.control}
                            register={form.register()}
                            name='due'
                            valueName='selected'
                            onChange={([selected]) => selected}
                        />
                        {form.errors.due && <span className='error'>
                            {form.errors.due.message}
                        </span>}
                    </td>
                </tr>}<tr className='row row-description'>
                    <th scope='row'>
                        <label htmlFor='description'>Description:</label>
                    </th><td>
                        <input name='description' ref={form.register} />
                    </td>
                </tr></tbody></table>
                <table className='transaction-elements'><thead><tr>
                    <th rowSpan={2}>
                        Revenue type
                    </th><th rowSpan={2} colSpan={3}>
                        Description
                    </th><th scope='colgroup' colSpan={3}>
                        Amount
                    </th><td rowSpan={2}>
                        &nbsp;
                    </td>
                </tr><tr>
                    <th>
                        Currency
                    </th><th>
                        Gross
                    </th><th>
                        Net
                    </th>
                </tr></thead>
                {fields.map((item, index) =>
                    <ElementFamily
                        key={item.id}
                        currency={fields[0].currency}
                        {...{form, item, index, revenueOptions}}
                    />
                )}
                </table>
                <div className='more'>
                    <button type='button' onClick={() => append({name: 'elements'})}>
                        More rows
                    </button>
                </div><div className='error'>
                    {form.errors.submit && <span className='error'>{form.errors.submit.message}</span>}
                </div><div className='buttons'>
                    <input type='submit' value='Save' />
                    <input type='submit' value='Save and new' onClick={() => {
                        action = 'and-new'
                    }} />
                </div>
            </form>
        </div>

        return <div>
            {saleForm}
            {!!transaction.id && transaction.type == Transaction.Invoice &&
            transaction.elements && transaction.elements.length > 0 &&
            <InvoicePayment transaction={transaction} />}
        </div>
    }

    return null
}

type ElementFamilyProps = {
    form: FCV<FormData>
    item: Partial<ArrayField<Record<string, any>, "id">>
    index: number
    currency: string
    revenueOptions: {}
}

function ElementFamily(props: ElementFamilyProps) {
    const {form, item, index, revenueOptions} = props
    const {fields, append} = useFieldArray({control: form.control, name: `elements[${index}].taxes`})

    const [formatted, setFormatted] = React.useState<string>(item.amount)
    const [grossFormatted, setGrossFormatted] = React.useState<string>(item.grossAmount)
    const [useGross, setUseGross] = React.useState<number>(item.useGross ? 1 : 0)
    const [currency, setCurrency] = React.useState<string>(props.currency)
    const [rates, setRates] = React.useState<string[]>(fields.map(subItem => subItem.rate))
    const [baseCodes, setBaseCodes] = React.useState<string[]>(fields.map(subItem => subItem.baseCode))

    const state = {formatted, setFormatted, grossFormatted, setGrossFormatted, useGross, setUseGross, currency, setCurrency, rates, setRates}
    const [enabled, setEnabled] = React.useState<boolean>(!item.useGross || !item.grossAmount)
    const [grossEnabled, setGrossEnabled] = React.useState<boolean>(item.useGross || !item.amount)
    const [ratesEnabled, setRatesEnabled] = React.useState<boolean[]>(fields.map(subItem => new TaxCodeInfo(subItem.baseCode).variable))
    const formErrors: any = form.errors

    React.useEffect(() => {
        if (!item.eId && fields.length == 0) {
            append({name: `elements[${index}].taxes`})
        }
    }, [])

    return <tbody className='element-family'>
    <tr className={`element element-${index}`} key={item.id}><td className='account' rowSpan={65534}>
        {!!item.eId &&
        <input type='hidden' name={`elements[${index}].eId`} value={item.eId} ref={form.register()} />}
        <select
            name={`elements[${index}].accountId`}
            defaultValue={item.accountId}
            ref={form.register()}>
            {!item.accountId && <option key='' value=''></option>}
            {revenueOptions}
        </select>
        {form.errors.elements && form.errors.elements[index] &&
            form.errors.elements[index].accountId &&
            <div className='error'>{form.errors.elements[index].accountId!.message}</div>}
    </td><td className='description' colSpan={3}>
        <input
            name={`elements[${index}].description`}
            defaultValue={item.description}
            ref={form.register()}
        />
    </td><td className='currency'>
        {index == 0 ?
        <MaybeSelect
            name={`elements[${index}].currency`}
            defaultValue={item.currency}
            onChange={(e: {target: {value: string}}) => {
                state.currency = e.target.value
                formCalculateTaxes(form, `elements[${index}]`, state, 'currency')
            }}
            forwardRef={form.register()}>
            {currencySelectOptions(item.currency)}
        </MaybeSelect> :
        <input
            type='hidden'
            name={`elements[${index}].currency`}
            value={currency}
            ref={form.register()}
        />}
        <input
            type='hidden'
            name={`elements[${index}].useGross`}
            value={state.useGross}
            ref={form.register()}
        />
    </td><td className='gross-amount'>
        <input
            name={`elements[${index}].grossAmount`}
            defaultValue={item.grossAmount}
            disabled={!grossEnabled}
            onChange={e => {
                state.grossFormatted = e.target.value
                state.useGross = e.target.value ? 1 : 0
                formCalculateTaxes(form, `elements[${index}]`, state, 'grossAmount')
                setEnabled(e.target.value ? false : true)
            }}
            ref={form.register()}
        />
        {form.errors.elements && form.errors.elements[index] &&
            form.errors.elements[index].grossAmount &&
            <div className='error'>{form.errors.elements[index].grossAmount!.message}</div>}
    </td><td className='amount'>
        <input
            name={`elements[${index}].amount`}
            defaultValue={item.amount}
            disabled={!enabled}
            onChange={e => {
                state.formatted = e.target.value
                formCalculateTaxes(form, `elements[${index}]`, state, 'amount')
                setGrossEnabled(e.target.value ? false : true)
            }}
            ref={form.register()}
        />
        {form.errors.elements && form.errors.elements[index] &&
            form.errors.elements[index].amount &&
            <div className='error'>{form.errors.elements[index].amount!.message}</div>}
    </td><td className='add-tax' rowSpan={65534}>
        <button type='button' onClick={() => append({name: `elements[${index}].taxes`})}>
            Add tax
        </button>
    </td></tr>

    {fields.map((subItem, subIndex) => {
        const baseCodeInfo = baseCodes[subIndex] ? new TaxCodeInfo(baseCodes[subIndex]) : undefined
        const tagOptions = baseCodeInfo ? baseCodeInfo.tagOptions(true) : {}
        const hasTagOptions = Object.keys(tagOptions).length > 0

        return <tr className={`child child-${subIndex}${subIndex == fields.length-1 ? ' child-last' : ''}`} key={subItem.id}>
        <td className='child-tax-code' colSpan={3}>
            {!!subItem.eId &&
            <input
                type='hidden'
                name={`elements[${index}].taxes[${subIndex}].eId`}
                value={subItem.eId}
                ref={form.register()}
            />}
            <label htmlFor={`elements[${index}].taxes[${subIndex}].baseCode`}>Tax:
                <select
                    name={`elements[${index}].taxes[${subIndex}].baseCode`}
                    defaultValue={subItem.baseCode}
                    onChange={e => {
                        const info = new TaxCodeInfo(e.target.value)
                        form.setValue(`elements[${index}].taxes[${subIndex}].rate`, info.rate)
                        state.rates[subIndex] = info.rate
                        formCalculateTaxes(form, `elements[${index}]`, state, 'rates')

                        ratesEnabled[subIndex] = info.variable
                        setRatesEnabled([...ratesEnabled])

                        baseCodes[subIndex] = e.target.value
                        setBaseCodes([...baseCodes])
                    }}
                    ref={form.register()}
                >
                    {!subItem.baseCode && hasActiveTaxAuthority() && <option key='forbidden' value='forbidden'></option>}
                    <option key='' value=''>None</option>
                    {taxSelectOptions(true, baseCodeInfo)}
                </select>
            </label>
            {hasTagOptions && <>&nbsp;</>}
            <label htmlFor={`elements[${index}].taxes[${subIndex}].tag`} style={hasTagOptions ? {} : {display: 'none'}}>Tag:
                <select
                    name={`elements[${index}].taxes[${subIndex}].tag`}
                    defaultValue={subItem.tag}
                    ref={form.register()}
                >
                    <option key='' value=''>None</option>
                    {hashSelectOptions(tagOptions)}
                </select>
            </label>
            {formErrors.elements && formErrors.elements[index] &&
                formErrors.elements[index].taxes && formErrors.elements[index].taxes[subIndex] &&
                formErrors.elements[index].taxes[subIndex].baseCode &&
                <div className='error'>{formErrors.elements[index].taxes[subIndex].baseCode.message}</div>}
        </td><td className='child-tax-rate'>
            <label htmlFor={`elements[${index}].taxes[${subIndex}].rate`}>
                Rate:<input
                    name={`elements[${index}].taxes[${subIndex}].rate`}
                    defaultValue={subItem.rate}
                    onChange={e => {
                        state.rates[subIndex] = e.target.value
                        formCalculateTaxes(form, `elements[${index}]`, state, 'rates')
                    }}
                    disabled={!ratesEnabled[subIndex]}
                    ref={form.register()}
                /> %
            </label>
        </td><td className='child-amount' colSpan={2}>
            <label htmlFor={`elements[${index}].taxes[${subIndex}].amount`}>Amount:
                <input
                    name={`elements[${index}].taxes[${subIndex}].amount`}
                    defaultValue={subItem.amount}
                    disabled={true}
                    ref={form.register()}
                />
            </label>
            {formErrors.elements && formErrors.elements[index] &&
                formErrors.elements[index].taxes && formErrors.elements[index].taxes[subIndex] &&
                formErrors.elements[index].taxes[subIndex].amount &&
                <div className='error'>{formErrors.elements[index].taxes[subIndex].amount.message}</div>}
        </td></tr>
    })}
    </tbody>
}

export function extractFormValues(t: Transaction): FormData {
    const values: FormData = {
        type: t.type!,
        date: parseISO(t.date!),
        due: t.due ? parseISO(t.due) : undefined,
        description: t.description,
        actorId: t.actorId!,
        actorTitle: '',
        elements: [],
    }

    if (t.elements) {
        const children = []
        for (let e of t.elements) {
            if (e.drcr == Transaction.Credit) {
                // Only populate credit elements
                if (e.parentId == 0) {
                    values.elements.push({
                        eId: e.id,
                        accountId: e.accountId!,
                        amount: toFormatted(e.amount!, e.currency!),
                        _amount: e.amount!,
                        currency: e.currency!,
                        useGross: e.useGross!,
                        grossAmount: '',
                        description: e.description,
                        taxes: [],
                    })
                }
                else {
                    children.push(e)
                }
            }
        }

        // Now populate child elements. Any orphans are promoted.
        for (let e of children) {
            let orphan = true
            for (let p of values.elements) {
                if (e.parentId == p.eId) {
                    const info = new TaxCodeInfo(e.taxCode!)
                    p.taxes!.push({
                        eId: e.id,
                        baseCode: e.taxCode ? info.baseCode : '',
                        tag: e.taxCode ? info.tag : '',
                        rate: e.taxCode ? info.rate : '',
                        amount: toFormatted(e.amount!, e.currency!),
                        _amount: e.amount!,
                    })

                    orphan = false
                    break
                }
            }

            if (orphan) {
                values.elements.push({
                    eId: e.id,
                    accountId: e.accountId!,
                    amount: toFormatted(e.amount!, e.currency!),
                    _amount: e.amount!,
                    currency: e.currency!,
                    useGross: e.useGross!,
                    grossAmount: '',
                    description: e.description,
                })
            }
        }

        // Now calculate grossAmount
        for (let e of values.elements) {
            let amount = e._amount!
            for (let t of e.taxes!) {
                amount += t._amount!
            }
            e.grossAmount = toFormatted(amount, e.currency)
        }
    }

    return values
}

// Returns true if validation succeeded, false otherwise
export function validateFormData(form: FCV<FormData>, data: FormData) {
    if (!data.type) {
        form.setError('type', '', 'Type is required')
        return false
    }
    if (!data.actorId) {
        form.setError('actorId', '', 'Customer is required')
        return false
    }
    if (data.actorId == Actor.NewCustomer && !data.actorTitle) {
        form.setError('actorTitle', '', 'Name is required')
        return false
    }
    if (!data.date) {
        form.setError('date', '', 'Date is required')
        return false
    }
    if (!data.elements || data.elements.length == 0) {
        form.setError('submit', '', 'Nothing to save')
        return false
    }

    for (let index in data.elements) {
        if (!data.elements[index].accountId) {
            form.setError(`elements[${index}].accountId`, '', 'This is required')
            return false
        }

        if (data.elements[index].taxes) {
            const authorities: string[] = []
            for (let subIndex in data.elements[index].taxes!) {
                if (data.elements[index].taxes![subIndex].baseCode) {
                    if (data.elements[index].taxes![subIndex].baseCode == 'forbidden') {
                        form.setError(`elements[${index}].taxes[${subIndex}].baseCode`, '', 'Please select tax')
                        return false
                    }

                    const info = new TaxCodeInfo(data.elements[index].taxes![subIndex].baseCode)
                    if (authorities.indexOf(info.authority) >= 0) {
                        form.setError(`elements[${index}].taxes[${subIndex}].baseCode`, '', 'Duplicated tax authority')
                        return false
                    }
                    authorities.push(info.authority)
                }
            }
        }
    }

    return validateElementAmounts(form, data) && validateElementTaxAmounts(form, data)
}

// Returns: id of the transaction that was saved/created, 0 otherwise
export async function saveFormData(transaction: Transaction, data: FormData, trx?: TransactionOrKnex): Promise<number> {
    if (data.actorId == Actor.NewCustomer) {
        const actor = Actor.construct({title: data.actorTitle!.trim(), type: Actor.Customer})
        await actor.save(trx)
        data.actorId = actor.id!
    }

    // Get a list of balancing IDs. Re-use them if available
    const ids = transaction.getDrElementIds()

    Object.assign(transaction, {
        description: data.description,
        type: data.type,
        date: toDateOnly(data.date),
        due: data.due ? toDateOnly(data.due) : '',
        actorId: data.actorId,
    })

    // Convert form data to elements
    const elements: IElement[] = []
    data.elements.forEach(e0 => {
        elements.push({
            id: e0.eId ? Number(e0.eId) : undefined,
            accountId: Number(e0.accountId),
            drcr: Transaction.Credit,
            // Note: Use the currency value of the first item
            amount: parseFormatted(e0.amount, data.elements[0].currency),
            currency: data.elements[0].currency,
            useGross: e0.useGross,
            description: e0.description,
            settleId: 0,
            taxCode: '',
        })

        if (e0.taxes) {
            e0.taxes.forEach(sub => {
                let taxCode = ''
                if (sub.baseCode) {
                    const info = new TaxCodeInfo(sub.baseCode)
                    if (sub.tag) {
                        info.tag = sub.tag
                    }
                    info.rate = sub.rate
                    taxCode = info.taxCode
                }

                elements.push({
                    id: sub.eId ? Number(sub.eId) : undefined,
                    accountId: Account.Reserved.TaxPayable,
                    drcr: Transaction.Credit,
                    // Note: Use the currency value of the first item
                    amount: parseFormatted(sub.amount, data.elements[0].currency),
                    currency: data.elements[0].currency,
                    useGross: 0,
                    description: '',
                    settleId: 0,
                    taxCode,
                    parentId: -1,
                })
            })
        }
    })

    // Generate balancing elements.
    for (let money of Transaction.getCreditBalances(elements)) {
        elements.push({
            id: ids.shift(),
            accountId: data.type == Transaction.Sale ? Account.Reserved.Cash : Account.Reserved.AccountsReceivable,
            drcr: Transaction.Debit,
            amount: money.amount,
            currency: money.currency,
            useGross: 0,
            description: '',
            settleId: 0,
            taxCode: '',
        })
    }

    // If there are any remaining old IDs/elements, zero them out
    for (let id of ids) {
        elements.push({
            id: id,
            drcr: Transaction.Debit,
            amount: 0,
            currency: '',
        })
    }

    // Merge and save.
    await transaction.mergeElements(elements)
    await transaction.save(trx)
    transaction.condenseElements()

    return transaction.id!
}
