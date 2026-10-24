import jwt from 'jsonwebtoken';

const ONEVIEW_JWT_SECRET = process.env.ONEVIEW_JWT_SECRET;

export function signOneviewToken ({ partyId, mobile }) {
    if(!ONEVIEW_JWT_SECRET) {
        throw new Error('Secret key is not set.')
    }

    return jwt.sign({ party_id: partyId, mobile }, ONEVIEW_JWT_SECRET, {expiresIn: '60s'})
}