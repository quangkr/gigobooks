/**
 * Copyright (c) 2020-present Beng Tan
 */

import * as React from 'react'
import { useForm, useFieldArray, FormContextValues as FCV } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { Project, TaxAuthority, taxAuthorities } from '../core'
import { playSuccess, playAlert } from '../util/sound'
import { hashSelectOptions } from './SelectOptions'

type FormData = {
    taxAuthority: string
    otherTaxAuthorities: string[]
    submit?: string    // Only for displaying general submit error messages
}

function taxAuthorityOptions() {
    return <>
        {Object.keys(taxAuthorities).filter(k => {
            return taxAuthorities[k].enable
        }).map(k => 
            <option key={k} value={k}>{taxAuthorities[k].regionName}: {taxAuthorities[k].title}</option>
        )}
    </>
}

export default function SettingsTax({refreshApp}: {refreshApp: () => void}) {
    const homeAuthority = Project.variables.get('taxAuthority')
    const form = useForm<FormData>({
        defaultValues: extractFormValues(),
    })
    const {fields, append} = useFieldArray({control: form.control, name: 'otherTaxAuthorities'})

    const onSubmit = async (data: FormData) => {
        if (!validateFormData(form, data)) {
            playAlert()
            return
        }

        saveFormData(data).then(() => {
            playSuccess()
            form.reset(extractFormValues())

            // Need to 'refresh app' since tax settings may affect app menu items
            refreshApp()
        }).catch(e => {
            playAlert()
            form.setError('submit', '', e.toString())
        })
    }

    return <div>
        <h1>
            <span className='breadcrumb'>
                <Link to='/settings'>Settings</Link> » </span>
            <span className='title'>
                Tax Settings
            </span>
        </h1>
        <form onSubmit={form.handleSubmit(onSubmit)}>
            <table className='horizontal-table-form'><tbody><tr className='row row-tax-authority'>
                <th scope='row'>
                    <label htmlFor='taxAuthority'>Home tax authority:</label>
                </th><td>
                    <select name='taxAuthority' ref={form.register}>
                        <option key='none' value='none'>Not in this list</option>
                        {taxAuthorityOptions()}
                    </select>
                    <button type='button' onClick={() => append({name: 'otherTaxAuthorities'})}>
                        Add tax authority
                    </button>
                </td>
            </tr>

            {fields.map((item, index) =>
                <tr key={item.id} className='row row-other-tax-authority'><th scope='row'>
                    {index == 0
                    ? <label htmlFor='otherTaxAuthorities[0]'>Other tax authorities:</label>
                    : <>&nbsp;</>}                        
                </th><td>
                    <select
                        name={`otherTaxAuthorities[${index}]`}
                        defaultValue={item.value}
                        ref={form.register()}
                    >
                        <option key='none' value='none'>None</option>
                        {taxAuthorityOptions()}
                    </select>
                </td></tr>
            )}            

            {[homeAuthority, ...Project.variables.get('otherTaxAuthorities')].map(k => {
                if (taxAuthorities[k] && taxAuthorities[k].enable) {
                    return <AuthoritySettings key={k} form={form} homeAuthority={homeAuthority} authority={taxAuthorities[k]} />
                }
            })}

            </tbody></table>
            <div className='errors'>
                {form.errors.submit && form.errors.submit.message}
            </div><div className='buttons'>
                <input type='submit' value='Save' />
            </div>
        </form>
    </div>
}

function AuthoritySettings(props: {form: FCV<FormData>, homeAuthority: string, authority: TaxAuthority}) {
    const {form, homeAuthority, authority} = props
    const fields = authority.settings(homeAuthority)
    const hasSettings = Object.keys(fields).length > 0

    return hasSettings ? <>
        <tr><th colSpan={2}><h2>{`Settings (${authority.regionName})`}</h2></th></tr>
        {Object.keys(fields).map(key => {
            const field = fields[key]

            return <tr key={key} className='row'>
                <th scope='row'>
                    <label htmlFor={key}>{`${field.label}:`}</label>
                </th><td>
                    {field.type == 'text' && <input name={key} ref={form.register} />}
                    {field.type == 'select' && <select name={key} ref={form.register}>
                        {hashSelectOptions(field.options!)}
                    </select>}
                    {field.type == 'checkbox' && <input type='checkbox' name={key} ref={form.register} />}
                </td>
            </tr>
        })}
    </> : null
}

function extractFormValues(): FormData {
    const homeAuthority = Project.variables.get('taxAuthority')
    const variables = [
        'taxAuthority',
        'otherTaxAuthorities'
    ]

    // Get variables for tax authorities
    ;[homeAuthority, ...Project.variables.get('otherTaxAuthorities')].forEach(k => {
        if (taxAuthorities[k] && taxAuthorities[k].enable) {
            variables.push(...Object.keys(taxAuthorities[k].settings(homeAuthority)))
        }
    })

    return Project.variables.getMultiple(variables) as FormData
}

// Returns true if validation succeeded, false otherwise
export function validateFormData(form: FCV<FormData>, data: FormData) {
    return true
}

// Returns: positive for success, 0 otherwise
async function saveFormData(data: FormData) {
    // Filter out $currency and 'none' from otherTaxAuthorities.
    // Then remove duplicates and sort.
    data.otherTaxAuthorities = data.otherTaxAuthorities || []
    data.otherTaxAuthorities = [...new Set(data.otherTaxAuthorities.filter(c => {
        return c != data.taxAuthority && c != 'none'
    }))].sort()

    await Project.variables.setMultiple(data)
}