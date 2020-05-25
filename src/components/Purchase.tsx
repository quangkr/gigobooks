import * as React from 'react'
import { Controller, useForm, useFieldArray, ArrayField, FormContextValues as FCV } from 'react-hook-form'
import { Redirect } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import { Project, Transaction, Account, Actor, IElement, toFormatted, parseFormatted } from '../core'
import { toDateOnly, validateElementAmounts } from '../util/util'
import { parseISO } from 'date-fns'
import { MaybeSelect, flatSelectOptions, accountSelectOptions, currencySelectOptions } from './SelectOptions'

type Props = {
    arg1?: string
}

type FormData = {
    actorId: number
    date: Date
    description?: string
    elements: {
        // `.id` is used by the form system so we have eId to store 'our' id
        eId?: number
        accountId: number
        amount: string
        currency: string
        description?: string
    }[]
    accountId: number
    submit?: string    // Only for displaying general submit error messages
}

export default function Expense(props: Props) {
    // argId == 0 means creating a new transaction
    const argId = /^\d+$/.test(props.arg1!) ? Number(props.arg1) : 0

    const [transaction, setTransaction] = React.useState<Transaction>()
    const [accountOptions, setAccountOptions] = React.useState<{}>()
    const [sourceOptions, setSourceOptions] = React.useState<{}>()
    const [supplierOptions, setSupplierOptions] = React.useState<{}>()
    const [redirectId, setRedirectId] = React.useState<number>(0)

    const form = useForm<FormData>()
    const {fields, append} = useFieldArray({control: form.control, name: 'elements'})

    // Initialise a lot of stuff
    React.useEffect(() => {
        // Clear redirectId
        setRedirectId(0)

        // Load expense and asset accounts
        Account.query().select()
        .whereIn('type', [Account.Asset, Account.LongTermAsset,
            ...Account.TypeGroupInfo[Account.Expense].types])
        .whereNot('id', Account.Reserved.AccountsReceivable)
        .orderBy(['title'])
        .then(rows => {
            // Split into expenses and assets
            const accounts = rows.filter(a => a.type == Account.LongTermAsset || a.typeGroup == Account.Expense)
            const groupInfo = {
                [Account.Expense]: { label: 'Expense' },
                [Account.Asset]: { label: 'Long term asset' },
            }
            setAccountOptions(accountSelectOptions(accounts, groupInfo))
            setSourceOptions(flatSelectOptions(rows.filter(a => a.type == Account.Asset)))
        })

        // Load customers
        Actor.query().select()
        .where('type', Actor.Supplier)
        .orderBy('title')
        .then(rows => {
            setSupplierOptions(flatSelectOptions(rows))
        })
        
        // Load transaction (if exists) and initialise form accordingly
        if (argId > 0) {
            Transaction.query().findById(argId).where('type', Transaction.Purchase)
            .withGraphFetched('elements')
            .then(t => {
                setTransaction(t)
                if (t) {
                    form.reset(extractFormValues(t))
                }
            })
        }
        else {
            setTransaction(Transaction.construct({}))
            const currency = Project.variables.get('currency')
            form.reset({
                actorId: 0,
                date: new Date(),
                elements: [{currency}, {currency}],
                accountId: Account.Reserved.Cash,
            })
        }
    }, [props.arg1])

    const onSubmit = (data: FormData) => {
        if (!validateFormData(form, data)) {
            return
        }

        saveFormData(form, transaction!, data).then(savedId => {
            if (savedId) {
                form.reset(extractFormValues(transaction!))
                if (argId == 0) {
                    setRedirectId(savedId)
                }
            }
        }).catch(e => {
            form.setError('submit', '', e.toString())
        })
    }

    if (redirectId > 0 && redirectId != argId) {
        return <Redirect to={`/purchases/${redirectId}`} />
    }
    else if (transaction && accountOptions && sourceOptions && supplierOptions) {
        return <div>
            <h1>{transaction.id ? `Purchase ${transaction.id}` : 'New purchase'}</h1>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div>
                    <label htmlFor='actorId'>Supplier:</label>
                    <select name='actorId' ref={form.register}>
                        {supplierOptions}
                    </select>
                    {form.errors.actorId && form.errors.actorId.message}
                </div><div>
                    <label htmlFor='date'>Date:</label>
                    <Controller
                        // No-op for DatePicker.onChange()
                        as={<DatePicker onChange={() => {}} />}
                        control={form.control}
                        register={form.register()}
                        name='date'
                        valueName='selected'
                        onChange={([selected]) => {
                            return selected
                        }}
                        rules={{required: 'Date is required'}}
                    />
                    {form.errors.date && form.errors.date.message}
                </div><div>
                    <label htmlFor='description'>Description:</label>
                    <input name='description' ref={form.register} />
                </div><div>
                    <table><thead>
                        <tr><th>
                            Account
                        </th><th>
                            Description
                        </th><th>
                            Amount
                        </th></tr>
                    </thead><tbody>
                    {fields.map((item, index) =>
                        <ElementFamily key={item.id} {...{form, item, index, accountOptions}} />
                    )}
                    </tbody></table>
                </div><div>
                    <button type='button' onClick={() => append({name: 'elements'})}>
                        More rows
                    </button>
                </div><div>
                    <label htmlFor='accountId'>Pay from:</label>
                    <select name='accountId' ref={form.register}>
                        {sourceOptions}
                    </select>
                </div><div>
                    {form.errors.submit && form.errors.submit.message}
                </div><div>
                    <input type='submit' value={argId ? 'Save' : 'Create'} />
                </div>
            </form>
        </div>
    }

    return null
}

type ElementFamilyProps = {
    form: FCV<FormData>
    item: Partial<ArrayField<Record<string, any>, "id">>
    index: number
    accountOptions: {}
}

function ElementFamily(props: ElementFamilyProps) {
    const {form, item, index, accountOptions} = props
    return <tr key={item.id}><td>
        {!!item.eId && 
        <input type='hidden' name={`elements[${index}].eId`} value={item.eId} ref={form.register()} />}
        <select
            name={`elements[${index}].accountId`}
            defaultValue={item.accountId}
            ref={form.register()}>
            {accountOptions}
        </select>
    </td><td>
        <input
            name={`elements[${index}].description`}
            defaultValue={item.description}
            ref={form.register()}
        />
    </td><td>
        {index == 0 ?
        <MaybeSelect
            name={`elements[${index}].currency`}
            defaultValue={item.currency}
            forwardRef={form.register()}>
            {currencySelectOptions(item.currency)}
        </MaybeSelect> :
        <input
            type='hidden'
            name={`elements[${index}].currency`}
            value={item.currency}
            ref={form.register()}
        />}
        <input
            name={`elements[${index}].amount`}
            defaultValue={item.amount}
            ref={form.register()}
        />
        {form.errors.elements && form.errors.elements[index] &&
            form.errors.elements[index].amount &&
            <div>{form.errors.elements[index].amount!.message}</div>}
    </td></tr>
}

function extractFormValues(t: Transaction): FormData {
    const values: FormData = {
        date: parseISO(t.date!),
        description: t.description,
        actorId: t.actorId!,
        elements: [],
        accountId: t.getFirstCrElement()!.accountId!,
    }

    if (t.elements) {
        for (let e of t.elements) {
            if (e.drcr == Transaction.Debit) {
                // Only populate debit elements
                values.elements.push({
                    eId: e.id,
                    accountId: e.accountId!,
                    amount: toFormatted(e.amount!, e.currency!),
                    currency: e.currency!,
                    description: e.description,
                })
            }
        }
    }

    return values
}

// Returns true if validation succeeded, false otherwise
function validateFormData(form: FCV<FormData>, data: FormData) {
    let success = true

    if (!data.actorId) {
        form.setError('actorId', '', 'Supplier is required')
        success = false
    }
    return success && validateElementAmounts(form, data)
}

// Returns: id of the transaction that was saved/created, 0 otherwise
async function saveFormData(form: FCV<FormData>, transaction: Transaction, data: FormData): Promise<number> {
    Object.assign(transaction, {
        description: data.description,
        type: Transaction.Purchase,
        date: toDateOnly(data.date),
        actorId: data.actorId,
    })

    // Convert form data to elements
    const elements: IElement[] = data.elements.map(e0 => {
        return {
            id: e0.eId ? Number(e0.eId) : undefined,
            accountId: Number(e0.accountId),
            drcr: Transaction.Debit,
            // Note: Use the currency value of the first item
            amount: parseFormatted(e0.amount, data.elements[0].currency),
            currency: data.elements[0].currency,
            description: e0.description,
            settleId: 0,
        }
    })

    // Generate balancing elements. Try to re-use IDs if available
    const sums = Transaction.getSums(elements)
    const ids = transaction.getCrElementIds()

    for (let currency in sums) {
        elements.push({
            id: ids.shift(),
            accountId: data.accountId,
            drcr: Transaction.Credit,
            amount: sums[currency],
            currency: currency,
            description: '',
            settleId: 0,
        })
    }

    // If there are any remaining old IDs/elements, zero them out
    for (let id of ids) {
        elements.push({
            id: id,
            drcr: Transaction.Credit,
            amount: 0,
            currency: '',
        })
    }

    // Merge and save.
    await transaction.mergeElements(elements)
    await transaction.save()
    transaction.condenseElements()

    return transaction.id!
}
