import { Project, Account, Transaction } from '../src/core'
import { extractFormValues, saveFormData, validateFormData } from '../src/components/Sale'
import { MockForm } from '../src/test/MockForm'

const TaxPayable = Account.Reserved.TaxPayable
const Cash = Account.Reserved.Cash

const now = new Date()
const date = now.toISOString().substring(0, 10)

beforeAll(() => {
    return Project.create(':memory:')
})

afterAll(() => {
    Project.knex.destroy()
    return Project.close()
})

test('sale form', async done => {
    expect(validateFormData(MockForm.clear(), {type: Transaction.Sale, actorId: 0, date: new Date(), elements: []}))
        .toBe(false)
    expect(MockForm.errorField).toEqual('actorId')
    expect(MockForm.errorMessage).toEqual('Customer is required')

    // Save a sale using form data
    let t0 = Transaction.construct({})
    let result = await saveFormData(t0, {type: Transaction.Sale, actorId: 1, date: now, description: 'foo', elements: [
        {accountId: 400, amount: '10', currency: 'USD', useGross: 0, grossAmount: '11', description: 'one', taxes: [
            {baseCode: ':zero:0', tag: 'tagA', rate: '0', amount: '0'},
            {baseCode: '::', tag: 'tagB', rate: '10', amount: '1'},
            {baseCode: '', tag: '', rate: '', amount: '0'},
        ]},
        {accountId: 400, amount: '', currency: '', useGross: 0, grossAmount: '', description: 'empty'},
        {accountId: 401, amount: '100', currency: '', useGross: 1, grossAmount: '120', description: 'two', taxes: [
            {baseCode: '::10', tag: 'tagC', rate: '10', amount: '10'},
            {baseCode: '::10', tag: 'tagD', rate: '10', amount: '10'},
        ]},
    ]})
    expect(result).toBeTruthy()
    expect(t0.actorId).toBe(1)
    expect(t0.date).toBe(date)
    expect(t0.description).toBe('foo')
    expect(t0.elements!.length).toBe(7)
    expect(t0.elements![0]).toMatchObject({accountId: 400, amount: 1000, currency: 'USD', useGross: 0, description: 'one'})
    expect(t0.elements![1]).toMatchObject({accountId: 401, amount: 10000, currency: 'USD', useGross: 1, description: 'two'})
    expect(t0.elements![2]).toMatchObject({accountId: Cash, amount: 13100, currency: 'USD'})
    expect(t0.elements![3]).toMatchObject({accountId: TaxPayable, amount: 0, currency: 'USD', taxCode: ':zero;tagA:0', parentId: t0.elements![0].id})
    expect(t0.elements![4]).toMatchObject({accountId: TaxPayable, amount: 100, currency: 'USD', taxCode: ':;tagB:10', parentId: t0.elements![0].id})
    expect(t0.elements![5]).toMatchObject({accountId: TaxPayable, amount: 1000, currency: 'USD', taxCode: ':;tagC:10', parentId: t0.elements![1].id})
    expect(t0.elements![6]).toMatchObject({accountId: TaxPayable, amount: 1000, currency: 'USD', taxCode: ':;tagD:10', parentId: t0.elements![1].id})

    // Retrieve it and check
    const t1 = await Transaction.query().findById(result).withGraphFetched('elements')
    expect(t1).toMatchObject(t0)
    expect(t0).toMatchObject(t1)

    // Convert to form data
    let data = extractFormValues(t1)
    expect(data).toMatchObject({actorId: 1, description: 'foo'})
    expect(data.elements.length).toBe(2)
    expect(data.elements[0].taxes!.length).toBe(2)
    expect(data.elements[1].taxes!.length).toBe(2)
    expect(data.elements).toMatchObject([
        {eId: t1.elements![0].id, accountId: 400, amount: '10.00', currency: 'USD', useGross: 0, grossAmount: '11.00', description: 'one', taxes: [
            {eId: t1.elements![3].id, baseCode: ':zero:0', rate: '0', amount: '0.00'},
            {eId: t1.elements![4].id, baseCode: '::10', rate: '10', amount: '1.00'},
        ]},
        {eId: t1.elements![1].id, accountId: 401, amount: '100.00', currency: 'USD', useGross: 1, grossAmount: '120.00', description: 'two', taxes: [
            {eId: t1.elements![5].id, baseCode: '::10', rate: '10', amount: '10.00'},
            {eId: t1.elements![6].id, baseCode: '::10', rate: '10', amount: '10.00'},
        ]},
    ])

    // Remove tax 'two a', fiddle with 'two b', re-save
    data.elements[1].grossAmount = '110'
    Object.assign(data.elements[1].taxes![0], {baseCode: '', rate: '0.0', amount: '0.0'})
    Object.assign(data.elements[1].taxes![1], {baseCode: '', rate: '0'})

    result = await saveFormData(t1, data)
    expect(result).toBeTruthy()
    expect(t1.elements!.length).toBe(6)
    expect(t1.elements![2]).toMatchObject({accountId: Cash, amount: 12100, currency: 'USD'})
    expect(t1.elements![5]).toMatchObject({accountId: TaxPayable, amount: 1000, currency: 'USD', taxCode: '', parentId: t0.elements![1].id})

    // Retrieve and check
    const t2 = await Transaction.query().findById(result).withGraphFetched('elements')
    expect(t2).toMatchObject(t1)
    expect(t1).toMatchObject(t2)

    done()
})
