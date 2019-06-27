const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const FieldValue = admin.firestore.FieldValue;

const usersRef = admin.firestore().collection('users');

//errors
const ERROR_NOT_AUTHENTICATED = 'ERROR_NOT_AUTHENTICATED';
const ERROR_USER_NOT_FOUND = 'ERROR_USER_NOT_FOUND';
const ERROR_RECEIVER_ALREADY_HAS_PARTNER = 'ERROR_RECEIVER_ALREADY_HAS_PARTNER';
const ERROR_RECEIVER_HAS_PENDING_REQUEST = 'ERROR_RECEIVER_HAS_PENDING_REQUEST';
const ERROR_RECEIVER_EMAIL_REQUIRED = 'ERROR_RECEIVER_EMAIL_REQUIRED';

// == null, if null or undefined
// === null, if null 
// != null, if not null or undefined

exports.sendPartnerRequest = functions.region('europe-west1').https.onCall(async (data, context) => {

    if (context.auth == null) {
        throw new functions.https.HttpsError('unauthenticated', ERROR_NOT_AUTHENTICATED);
    }

    if (data == null || data.email == null) {
        throw new functions.https.HttpsError('invalid-argument', ERROR_RECEIVER_EMAIL_REQUIRED);
    }

    const senderUid = context.auth.uid;
    // todo: get name and email from auth instead of db
    //const senderName = context.auth.token.name || '';
    //const senderEmail = context.auth.token.email || '';
    const senderRef = usersRef.doc(senderUid);
    const senderDoc = await senderRef.get();
    const senderEmail = senderDoc.data().email != null ? senderDoc.data().email : '';
    const senderName = senderDoc.data().name != null ? senderDoc.data().name : '';

    const receiverEmail = data.email;

    try {
        let snapshots = await usersRef.where('email', '==', receiverEmail).get();
        if (snapshots.empty) {
            // no matching documents
            throw new Error(ERROR_USER_NOT_FOUND);
        }

        const receiverRef = snapshots.docs[0].ref;

        await admin.firestore().runTransaction(async t => {
            const doc = await t.get(receiverRef);
            const uid = doc.id;
            const email = doc.data().email != null ? doc.data().email : '';
            const name = doc.data().name != null ? doc.data().name : '';
            const partner = doc.data().partner;
            const partnerRequestFrom = doc.data().partnerRequestFrom;
            const partnerRequestTo = doc.data().partnerRequestTo;

            if (partner != null) {
                throw new Error(ERROR_RECEIVER_ALREADY_HAS_PARTNER);
            } else if (partnerRequestFrom != null || partnerRequestTo != null) {
                throw new Error(ERROR_RECEIVER_HAS_PENDING_REQUEST);
            }

            t.update(receiverRef, { partnerRequestFrom: { uid: senderUid, email: senderEmail, name: senderName } });
            t.update(senderRef, { partnerRequestTo: { uid: uid, email: email, name: name } })
        });
    } catch (e) {
        console.log(e);
        if (e instanceof Error) {
            if (e.message === ERROR_USER_NOT_FOUND) {
                throw new functions.https.HttpsError('not-found', ERROR_USER_NOT_FOUND);
            } else if (e.message === ERROR_RECEIVER_ALREADY_HAS_PARTNER) {
                throw new functions.https.HttpsError('already-exists', ERROR_RECEIVER_ALREADY_HAS_PARTNER);
            } else if (e.message === ERROR_RECEIVER_HAS_PENDING_REQUEST) {
                throw new functions.https.HttpsError('already-exists', ERROR_RECEIVER_HAS_PENDING_REQUEST);
            }
        }
        throw new functions.https.HttpsError('internal', 'INTERNAL');
    }
});