var express    = require("express");
var bodyParser = require('body-parser');
var app = express();
cors = require('cors');

const dotenv = require('dotenv');
const envresult = dotenv.config();

var corsOptions = {
   origin: '*',
}
app.use(cors(corsOptions));
 
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


//flow start
const { config, query, mutate, tx , sansPrefix, withPrefix  } = require('@onflow/fcl')
const { send  } = "@onflow/transport-http"

const { SHA3 } = require('sha3');
const elliptic = require('elliptic');

const curve = new elliptic.ec("p256");

 
config({
   "accessNode.api": process.env.AccessNode_Api, // Mainnet: "https://rest-mainnet.onflow.org"
   "discovery.wallet": "https://fcl-discovery.onflow.org/testnet/authn",
   "discovery.wallet.method": "HTTP/POST",
   "sdk.transport":send,
   "0xFlowToken":process.env.AiFlowMint
});


const hashMessageHex = (msgHex) => {
  const sha = new SHA3(256);
  sha.update(Buffer.from(msgHex, "hex"));
  return sha.digest();
};

const signWithKey = (privateKey, msgHex) => {
  const key = curve.keyFromPrivate(Buffer.from(privateKey, "hex"));
  const sig = key.sign(hashMessageHex(msgHex));
  const n = 32;
  const r = sig.r.toArrayLike(Buffer, "be", n);
  const s = sig.s.toArrayLike(Buffer, "be", n);
  return Buffer.concat([r, s]).toString("hex");
};

 const signer = async (account) => {
   
	const keyId = 0;
	const accountAddress = process.env.accountAddress;
	const pkey =process.env.pkey;

  // authorization function need to return an account
  return {
    ...account, // bunch of defaults in here, we want to overload some of them though
    tempId: `${accountAddress}-${keyId}`, // tempIds are more of an advanced topic, for 99% of the times where you know the address and keyId you will want it to be a unique string per that address and keyId
    addr: sansPrefix(accountAddress), // the address of the signatory, currently it needs to be without a prefix right now
    keyId: Number(keyId), // this is the keyId for the accounts registered key that will be used to sign, make extra sure this is a number and not a string

    // This is where magic happens!  
    signingFunction: async (signable) => {
      // Singing functions are passed a signable and need to return a composite signature
      // signable.message is a hex string of what needs to be signed.
      const signature = await signWithKey(pkey, signable.message);
      return {
        addr: withPrefix(accountAddress), // needs to be the same as the account.addr but this time with a prefix, eventually they will both be with a prefix
        keyId: Number(keyId), // needs to be the same as account.keyId, once again make sure its a number and not a string
        signature // this needs to be a hex string of the signature, where signable.message is the hex value that needs to be signed
      };
    }
  };
};


const mintNFT2 = async (type, url) => { //balance
   console.log("%cSigning Transaction");
  
    try {
	const cadence = `
            import AiFlowMint from 0xFlowToken
            import NonFungibleToken from 0x631e88ae7f1d7c20
            import MetadataViews from 0x631e88ae7f1d7c20

            transaction(type: String, url: String){
                let recipientCollection: &AiFlowMint.Collection{NonFungibleToken.CollectionPublic}

                prepare(signer: AuthAccount){
                     log("Hello from prepare")
                if signer.borrow<&AiFlowMint.Collection>(from: AiFlowMint.CollectionStoragePath) == nil {
                signer.save(<- AiFlowMint.createEmptyCollection(), to: AiFlowMint.CollectionStoragePath)
                signer.link<&AiFlowMint.Collection{NonFungibleToken.CollectionPublic, MetadataViews.ResolverCollection}>(AiFlowMint.CollectionPublicPath, target: AiFlowMint.CollectionStoragePath)
                }

                self.recipientCollection = signer.getCapability(AiFlowMint.CollectionPublicPath)
                                            .borrow<&AiFlowMint.Collection{NonFungibleToken.CollectionPublic}>()!
                }
                execute{
                    AiFlowMint.mintNFT(recipient: self.recipientCollection, type: type, url: url)
                }
            }
            `;
  
			// List of arguments
			const args =(arg, t) => [arg(type, t.String), arg(url, t.String)];
			const proposer = signer;
			const payer = signer;
			const authorizations = [signer];
			
			const txId = await mutate({  cadence,    args,   proposer,  payer,   authorizations,   limit: 999 });
			
			console.log(`Submitted transaction ${txId} to the network`);
			
			const label = "Transaction Sealing Time";
			// We will use transaction id in order to "subscribe" to it's state change and get the details
			// of the transaction
			console.time(label);
			const txDetails = await tx(txId).onceSealed();
			console.timeEnd(label);
			return txDetails;
			
			 
			
			
	} catch (error) {
      console.log("err..", error);
    }
};

//flow end


const fs = require('fs');
const multer = require('multer');
var moment = require('moment');
const request = require('request');

const { promisify } = require('util')
const unlinkAsync = promisify(fs.unlink)


var storage = multer.diskStorage({
  destination: function (req, file, cb) {
	var uploadPath = 'uploads';
	fs.exists(uploadPath, function(exists) {
        if(!exists) {
          fs.mkdir(uploadPath, function(err) {
            if(err) {
              console.log('Error in folder creation');
            }  
            
          })
        }
     })
     
    cb(null, uploadPath)
  },
  filename: function (req, file, cb) { 
    cb(null, file.originalname)
  }
})

var upload = multer({ storage: storage }).single('file')
 
 
function uploadipfsv2(ThumbImg) {  
  return new Promise((resolve, reject) => {      
		console.log('uploadipfs:----',ThumbImg); 
		var headers={ 'Content-Type': 'multipart/form-data','Authorization':'Bearer '+process.env.uploadipfsAuthtoken }
		var options = {   url: process.env.uploadipfsApi,  method: 'POST', headers: headers };
		options.formData = { file: fs.createReadStream(ThumbImg)  };
		
		 request(options,function (error, response, body) {
			  //var data=JSON.parse(body);
				if(error){	 
					console.log('er',error);
					reject({hash:'',error:true})
				}else{
					console.log('body:',body);//console.log('headers:',response.headers);
					resolve({body:body,headers:response.headers,response:response})
				}						
		 });
  });
}

 
app.post('/uploadfile',[ verifyToken,upload], async function(req, res){
	       console.log('data:',req.body);console.log('file:',req.file);
	   try {    
		   //file
		   if(typeof req.file!=='undefined'){
			       var ThumbImg=req.file.path;	console.log('file:',req.file);  console.log('ThumbImg:',ThumbImg);
			       uploadipfsv2(ThumbImg).then(async function(Resp) {
							console.log('1st:-',Resp.body);
							 // Delete the file like normal
  						    unlinkAsync(req.file.path)
							
							var Resp1=JSON.parse(Resp.body); console.log('Resp1:-',Resp1);
							
							if(typeof Resp1.Hash!=="undefined"){
								     try {
										 const mintNFT = await mintNFT2(Resp1.Name, process.env.ipfsurlprefix+Resp1.Hash);
										 res.status(Resp.response.statusCode).json({result:Resp1,mint:"Yes",mintresult:mintNFT});
									 } catch (error) {
										 console.log("mint err..", error);
									 res.status(Resp.response.statusCode).json({result:Resp1,mint:"No",mintresult:'error'});
								     }
							}else{
								res.status(Resp.response.statusCode).json({result:Resp1,mint:"No",mintresult:'error'});
							}
							
							
							
							
				   }).catch(err => {		
						res.status(200).json({Resp:'',error:true  });console.log('err:',err);
				   });
		   }else{
				res.status(200).json({resval:'file not upload'});   
		   }
		   
	 } catch (error) {
      console.log("err..", error);
	  res.status(200).json({resval:'file not upload, error'});   
    }
});

 

app.get('/', function(req, res){
   console.log("AccessNode_Api",  process.env.AccessNode_Api);
   res.send("Home Flow Proxy!");
});

app.get('/testmintnft', async function(req, res){
	   const mintNFT = await mintNFT2("Galaxy IPFS", process.env.ipfsurlprefix+"bafkreigq234wunexihix3ld7ygxkgihj3k35bxngefuu2p57xcihxkvclu");
	   console.log('mintNFT:',{ mintNFT });			 					 
	   res.status(200).json({mintNFT:mintNFT}); 
});

// Verify Token
function verifyToken(req, res, next) {
  // Get auth header value
  const bearerHeader = req.headers['authorization'];
  // Check if bearer is undefined
  if(typeof bearerHeader !== 'undefined') {
    // Split at the space
    const bearer = bearerHeader.split(' ');
    // Get token from array
    const bearerToken = bearer[1];
		/*token*/
		if(bearerToken==process.env.uploadflowAuthtoken){
			// Next middleware
		    next();
		}else{
			 res.status(200).json({Resp:'invalid token',error:true  });  
		}
		/*token*/
	
  } else {
    // Forbidden
    res.sendStatus(403);
  }

}

 
var server = app.listen(process.env.Flowport, function () {
  var host = server.address().address
  var port = server.address().port
  console.log("Example app listening at http://%s:%s", host, port)
})
