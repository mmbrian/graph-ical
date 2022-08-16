# from https://replit.com/@MohsenMansourya/ElectronicBouncySales

import uuid
import dateutil.parser as dp
from datetime import timedelta
from random import random

def genId():
    return str(uuid.uuid4())

def genActivityId():
    return "suite:activity_" + genId()


def genActivityDate(incDays = 1, startingDate = "2020-12-11T07:30:06.955000"):
  d = dp.isoparse(startingDate)
  d = d + timedelta(days=incDays)
  return d.isoformat()

def genActivityToDate(incSecs = 1, startingDate = "2020-12-11T07:30:06.955000"):
  d = dp.isoparse(startingDate)
  d = d + timedelta(seconds=incSecs)
  return d.isoformat()

def genActivityProb():
  return random()

def genActivity(incDays = 1):
  id = genActivityId()
  ret = id + " " + "rdf:type" + " " + "suite:Activity ."
  ret += "\r\n"
  ret += id + " " + 'suite:source "http://172.16.100.41:8080/ml-1/push"^^xsd:anyURI .'
  ret += "\r\n"
  ret += id + " " + 'suite:activityID "331"^^xsd:integer .'
  ret += "\r\n"
  ret += id + " " + 'suite:activityType suite:CoffeeMaking .'
  ret += "\r\n"
  ret += id + " " + 'suite:probability "' + str(genActivityProb()) + '"^^xsd:float .'
  ret += "\r\n"
  fromDate = genActivityDate(incDays = incDays)
  toDate = genActivityToDate(incSecs = 1, startingDate = fromDate)
  ret += id + " " + 'suite:from "' + fromDate + '"^^xsd:dateTime .'
  ret += "\r\n"
  ret += id + " " + 'suite:to "' + toDate + '"^^xsd:dateTime .'
  ret += "\r\n"
  ret += id + " " + 'suite:state suite:Complete .'
  ret += "\r\n"
  return ret

def gen(n):
  for incDays in range(1, n):
    print(genActivity(incDays))
    print()


