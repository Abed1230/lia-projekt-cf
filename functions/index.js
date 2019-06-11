const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const FieldValue = admin.firestore.FieldValue;

const usersRef = admin.firestore().collection('users');

const serverErrorMsg = 'Internal server error';

exports.sendPartnerRequest = functions.https.onCall((data, context) => {
    const hasPartnerMsg = 'receiver already has a partner';
    const hasPendingPartnerReqMsg = 'receiver has a pending partner request';

    const senderUid = context.auth.uid;
    const senderName = context.auth.token.name || null;
    const senderEmail = context.auth.token.email || null;
    const senderUserRef = usersRef.doc(senderUid);

    const receiverEmail = data.email;

    usersRef.where('email', '==', receiverEmail).get().then(snapshots => {
        if (snapshots.empty) {
            // no matching documents
            throw new functions.https.HttpsError('not-found', 'there are no users with the provided email address');
        }

        const receiverUserRef = snapshots.docs[0].ref;

        admin.firestore().runTransaction(async t => {
            const doc = await t.get(receiverUserRef);
            const uid = doc.id;
            const email = doc.get('email');
            const name = doc.get('name') != null ? doc.get('name') : '';
            const partner = doc.get('partner');
            const partnerRequestFrom = doc.get('partnerRequestFrom');
            const partnerRequestTo = doc.get('partnerRequestTo');

            if (partner != null) {
                Promise.reject(hasPartnerMsg);
            } else if (partnerRequestFrom != null) {
                Promise.reject(hasPendingPartnerReqMsg);
            } else if (partnerRequestTo != null) {
                Promise.reject(hasPendingPartnerReqMsg)
            } else {
                receiverUserRef.update({ partnerRequestFrom: { uid: senderUid, email: senderEmail, name: senderName } });
                senderUserRef.update({ partnerRequestTo: { uid: uid, email: email, name: name } })
            }
        }).then(() => {
            throw new functions.https.HttpsError('ok', 'partner request sent');
        }).catch(err => {
            console.log('error while running transcation: ' + err);
            if (err === hasPartnerMsg) {
                throw new functions.https.HttpsError('already-exists', hasPartnerMsg);
            } else if (err === hasPendingPartnerReqMsg) {
                throw new functions.https.HttpsError('already-exists', hasPendingPartnerReqMsg);
            } else {
                throw new functions.https.HttpsError('internal');
            }
        });
    }).catch(err => {
        console.log('error querying database: ' + err);
        throw new functions.https.HttpsError('internal');
    });
});