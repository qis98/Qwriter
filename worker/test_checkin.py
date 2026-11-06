import unittest
from checkin import check_account
class CheckinTests(unittest.TestCase):
    def run_case(self,values):
        calls=[]
        def request(endpoint):
            calls.append(endpoint);value=values.pop(0)
            if isinstance(value,Exception):raise value
            return value
        return request,calls
    def status(self,checked=False,active=True):return {'code':0,'data':{'today_checked_in':checked,'active':active,'today_credit':10}}
    def test_already_does_not_claim(self):
        request,calls=self.run_case([self.status(True)])
        self.assertEqual(check_account(request)['status'],'ALREADY');self.assertEqual(len(calls),1)
    def test_inactive_does_not_claim(self):
        request,calls=self.run_case([self.status(False,False)])
        self.assertEqual(check_account(request)['status'],'INACTIVE');self.assertEqual(len(calls),1)
    def test_claim_requires_readback(self):
        request,calls=self.run_case([self.status(),{'code':0},self.status(True)])
        self.assertEqual(check_account(request)['status'],'CLAIMED');self.assertEqual(calls.count('daily-checkin'),1)
    def test_ambiguous_claim_only_reads_back(self):
        request,calls=self.run_case([self.status(),TimeoutError(),self.status(True)])
        self.assertEqual(check_account(request)['status'],'CLAIMED');self.assertEqual(calls.count('daily-checkin'),1)
    def test_unknown_and_business_errors_never_claim(self):
        for response in [{'code':0,'data':{}},{'code':99,'data':{'active':True,'today_checked_in':False}}]:
            request,calls=self.run_case([response])
            with self.assertRaises(ValueError):check_account(request)
            self.assertEqual(len(calls),1)
if __name__=='__main__':unittest.main()
