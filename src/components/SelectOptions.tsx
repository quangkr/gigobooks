import * as React from 'react'
import { Account } from '../core'

// Some utility functions to help with constructing select options

// Given a list of accounts, constructs a nested list of select options
export function accountSelectOptions(accounts: Account[]) {
    const groups: any = {
        [Account.Asset]: [],
        [Account.Liability]: [],
        [Account.Equity]: [],
        [Account.Revenue]: [],
        [Account.Expense]: [],
    }

    // Distribute accounts into each 'bucket'
    for (let a of accounts) {
        groups[a.typeGroup].push(a)
    }

    return <>
        {Object.keys(groups).map(g => {
            if (groups[g].length > 0) {
                return <optgroup key={g} label={Account.TypeGroupInfo[g].label}>
                    {groups[g].map((a: Account) => 
                        <option key={a.id} value={a.id}>{a.title}</option>
                    )}
                </optgroup>
            }
            else {
                return null
            }        
        })}    
    </>
}