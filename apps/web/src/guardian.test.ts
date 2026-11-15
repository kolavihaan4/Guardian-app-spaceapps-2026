import { beforeEach, describe, expect, it } from 'vitest'
// The rule itself is the home site's own script. index.html loads it with a <script> tag; here its
// text is run the same way, so these tests cover what the app really calls.
import envScript from '../public/home/js/env.js?raw'
import { environmentFromHome, forgetLocationForVisit, forgetSavedLocation, locationAccount, saveEnvironmentForHome } from './guardian'

/** A page load: the script starts again, knowing nothing about who is signed in. */
const loadPage = () => new Function(envScript)()
/** A new visit: a new tab, so sessionStorage is empty while localStorage is as it was left. */
const newVisit = () => {
  sessionStorage.clear()
  loadPage()
}
const savedKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('guardian.env'))

beforeEach(() => {
  localStorage.clear()
  newVisit()
})

describe('the crew location, as the health app reads and writes it', () => {
  it('lasts for the visit only while nobody is signed in', () => {
    locationAccount(null)
    saveEnvironmentForHome('mars_surface')
    expect(environmentFromHome()).toBe('mars_surface')
    expect(sessionStorage.getItem('guardian.env')).toBe('mars')
    expect(localStorage.length).toBe(0)

    loadPage() // another page in the same tab
    locationAccount(null)
    expect(environmentFromHome()).toBe('mars_surface')

    newVisit()
    locationAccount(null)
    expect(environmentFromHome()).toBeUndefined()
  })

  it('is saved for a signed-in account and comes back on the next visit', () => {
    locationAccount('u1')
    saveEnvironmentForHome('lunar_base')
    expect(localStorage.getItem('guardian.env.u1')).toBe('moon')

    newVisit()
    expect(environmentFromHome()).toBeUndefined() // not before we know who is signed in
    locationAccount('u1')
    expect(environmentFromHome()).toBe('lunar_base')
  })

  it('is not handed to another account, or to a signed-out visitor', () => {
    locationAccount('u1')
    saveEnvironmentForHome('lunar_base')

    newVisit()
    locationAccount('u2')
    expect(environmentFromHome()).toBeUndefined()
    expect(savedKeys()).toEqual(['guardian.env.u1'])

    newVisit()
    locationAccount(null)
    expect(environmentFromHome()).toBeUndefined()
  })

  it('saves a location chosen before signing in, once the visitor signs in', () => {
    locationAccount(null)
    saveEnvironmentForHome('iss_leo')
    expect(savedKeys()).toEqual([])
    locationAccount('u1', true)
    expect(localStorage.getItem('guardian.env.u1')).toBe('iss')
    expect(environmentFromHome()).toBe('iss_leo')
  })

  it('signing out forgets the visit and keeps the account’s; deleting forgets the account’s', () => {
    locationAccount('u1')
    saveEnvironmentForHome('deep_space_transit')
    forgetLocationForVisit()
    expect(environmentFromHome()).toBeUndefined()
    expect(localStorage.getItem('guardian.env.u1')).toBe('spacecraft')

    forgetSavedLocation('u1')
    expect(savedKeys()).toEqual([])
  })

  it('a deleted saved location is not written back by the next answer from /api/me', () => {
    locationAccount('u1')
    saveEnvironmentForHome('mars_surface')
    forgetSavedLocation('u1')
    locationAccount('u1') // the app asks /api/me again after any change on the privacy page
    expect(savedKeys()).toEqual([])
    expect(environmentFromHome()).toBe('mars_surface') // the visit goes on
  })

  it('leaves the location alone for environments the home site does not have', () => {
    locationAccount('u1')
    saveEnvironmentForHome('mars_surface')
    saveEnvironmentForHome('eva_spacewalk')
    expect(environmentFromHome()).toBe('mars_surface')
  })

  it('removes a location the old rule left in the home site’s saved state', () => {
    localStorage.setItem('still.v1', JSON.stringify({ env: 'mars', intro: false }))
    newVisit()
    locationAccount(null)
    expect(JSON.parse(localStorage.getItem('still.v1') ?? '{}')).toEqual({ intro: false })
    expect(environmentFromHome()).toBeUndefined()
    expect(savedKeys()).toEqual([])

    localStorage.setItem('still.v1', JSON.stringify({ env: 'moon', intro: false }))
    newVisit()
    locationAccount('u1') // signed in at that moment: it becomes theirs
    expect(JSON.parse(localStorage.getItem('still.v1') ?? '{}')).toEqual({ intro: false })
    expect(localStorage.getItem('guardian.env.u1')).toBe('moon')
    expect(environmentFromHome()).toBe('lunar_base')
  })
})
